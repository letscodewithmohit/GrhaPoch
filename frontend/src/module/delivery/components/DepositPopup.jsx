import { useEffect, useRef, useState } from "react"
import { IndianRupee, Loader2 } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"

export default function DepositPopup({ onSuccess, cashInHand = 0 }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [method, setMethod] = useState("razorpay")
  const [bankDetails, setBankDetails] = useState(null)
  const [slipFiles, setSlipFiles] = useState([])
  const submitRef = useRef(null)

  const cashInHandNum = Number(cashInHand) || 0
  const latestDepositStatus = bankDetails?.latestDepositStatus || ""
  const latestDepositReason = bankDetails?.latestDepositReason || ""
  const hasPendingDeposit = latestDepositStatus === "pending"
  const mustUseBank = latestDepositStatus && latestDepositStatus !== "approved"

  useEffect(() => {
    const loadBankDetails = async () => {
      try {
        const res = await deliveryAPI.getBankDepositDetails()
        setBankDetails(res?.data?.data || {})
      } catch (err) {
        setBankDetails(null)
      }
    }
    loadBankDetails()
  }, [])

  useEffect(() => {
    setAmount(cashInHandNum > 0 ? cashInHandNum.toFixed(2) : "")
  }, [cashInHandNum])

  useEffect(() => {
    if (method === "bank" && slipFiles.length > 0) {
      submitRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [method, slipFiles.length])

  useEffect(() => {
    if (mustUseBank && method === "razorpay") {
      setMethod("bank")
    }
  }, [mustUseBank, method])

  const handleAmountChange = () => {}

  const handleSlipChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) {
      setSlipFiles([])
      return
    }
    setSlipFiles(files.slice(0, 5))
  }

  const handleDeposit = async () => {
    const amt = parseFloat(amount)
    if (hasPendingDeposit) {
      toast.error("You already have a pending bank deposit. Please wait for admin approval.")
      return
    }
    if (!amount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)")
      return
    }
    if (amt > 500000) {
      toast.error("Maximum deposit is ₹5,00,000")
      return
    }
    if (cashInHandNum < 1) {
      toast.error("No cash in hand to deposit")
      return
    }
    if (Math.abs(amt - cashInHandNum) > 0.01) {
      toast.error(`Deposit must be full cash-in-hand amount (₹${cashInHandNum.toFixed(2)})`)
      return
    }

    if (method === "bank") {
      if (!slipFiles.length) {
        toast.error("Please upload bank deposit slip")
        return
      }
      if (slipFiles.length > 5) {
        toast.error("You can upload maximum 5 slips")
        return
      }
      for (const f of slipFiles) {
        if (!["image/jpeg", "image/png"].includes(f.type)) {
          toast.error("Only JPG/PNG bank slip is allowed")
          return
        }
        if (f.size > 2 * 1024 * 1024) {
          toast.error("Bank slip size must be 2MB or less")
          return
        }
      }
      try {
        setLoading(true)
        const fd = new FormData()
        fd.append("amount", amt)
        slipFiles.forEach((f) => fd.append("slips", f))
        const res = await deliveryAPI.submitBankDeposit(fd, {
          headers: { "Content-Type": "multipart/form-data" }
        })
        if (res?.data?.success) {
          toast.success("Bank deposit submitted. Awaiting admin approval.")
          setAmount("")
          setSlipFiles([])
          if (onSuccess) onSuccess()
        } else {
          toast.error(res?.data?.message || "Failed to submit bank deposit")
        }
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to submit bank deposit")
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      setLoading(true)
      const orderRes = await deliveryAPI.createDepositOrder(amt)
      const data = orderRes?.data?.data
      const rp = data?.razorpay
      if (!rp?.orderId || !rp?.key) {
        toast.error("Payment gateway not ready. Please try again.")
        setLoading(false)
        return
      }
      setLoading(false)

      let profile = {}
      try {
        const pr = await deliveryAPI.getProfile()
        profile = pr?.data?.data?.profile || pr?.data?.profile || {}
      } catch (_) {}

      const phone = (profile?.phone || "").replace(/\D/g, "").slice(-10)
      const email = profile?.email || ""
      const name = profile?.name || ""

      setProcessing(true)
      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: "GrhaPoch",
        description: `Cash limit deposit - ₹${amt.toFixed(2)}`,
        prefill: { name, email, contact: phone },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: amt
            })
            if (verifyRes?.data?.success) {
              toast.success(`Deposit of ₹${amt.toFixed(2)} successful. Available limit updated.`)
              setAmount("")
              window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"))
              if (onSuccess) onSuccess()
            } else {
              toast.error(verifyRes?.data?.message || "Verification failed")
            }
          } catch (err) {
            toast.error(err?.response?.data?.message || "Verification failed. Contact support.")
          } finally {
            setProcessing(false)
          }
        },
        onError: (e) => {
          toast.error(e?.description || "Payment failed")
          setProcessing(false)
        },
        onClose: () => setProcessing(false)
      })
    } catch (err) {
      setLoading(false)
      setProcessing(false)
      toast.error(err?.response?.data?.message || "Failed to create payment")
    }
  }

  return (
    <div className="flex flex-col p-4 pb-28 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Deposit Method</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMethod("razorpay")}
            disabled={mustUseBank}
            className={`flex-1 py-2 rounded-lg border ${method === "razorpay" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"} ${mustUseBank ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Razorpay
          </button>
          <button
            type="button"
            onClick={() => setMethod("bank")}
            className={`flex-1 py-2 rounded-lg border ${method === "bank" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"}`}
          >
            Bank Deposit
          </button>
        </div>
      </div>


      {method === "bank" && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-800 mb-2">Bank Details</p>
            <div className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-2">
              <span className="text-slate-500">Bank</span>
              <span className="text-slate-800 font-medium">{bankDetails?.bankName || "-"}</span>
              <span className="text-slate-500">Account Holder</span>
              <span className="text-slate-800 font-medium">{bankDetails?.accountHolder || "-"}</span>
              <span className="text-slate-500">Account Number</span>
              <span className="text-slate-800 font-medium break-all">{bankDetails?.accountNumber || "-"}</span>
              <span className="text-slate-500">IFSC</span>
              <span className="text-slate-800 font-medium">{bankDetails?.ifsc || "-"}</span>
              <span className="text-slate-500">Branch</span>
              <span className="text-slate-800 font-medium">{bankDetails?.branch || "-"}</span>
              <span className="text-slate-500">Approval Time</span>
              <span className="text-slate-800 font-medium">
                {bankDetails?.approvalTime ? `${bankDetails.approvalTime} hours` : "-"}
              </span>
            </div>
          </div>
          {mustUseBank && (
            <p className="text-xs text-amber-600 mt-1">
              Razorpay is disabled until bank deposit is approved.
            </p>
          )}
        </>
      )}


      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Amount (₹)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <IndianRupee className="w-4 h-4" />
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={handleAmountChange}
            readOnly={true}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        {cashInHandNum > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Cash in hand: ₹{cashInHandNum.toFixed(2)}. Deposit cannot exceed this.
          </p>
        )}
        {hasPendingDeposit && (
          <p className="text-xs text-rose-600 mt-1">
            You already have a pending bank deposit. New deposits are blocked until approval.
          </p>
        )}
      </div>

      {method === "bank" && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Upload Bank Slip</label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleSlipChange}
            className="w-full text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">JPG/PNG only. Max 2MB each. Up to 5 files.</p>
          {slipFiles.length > 0 && (
            <p className="text-xs text-slate-600 mt-1">
              {slipFiles.length} file(s) selected
            </p>
          )}
        </div>
      )}
      <button
        ref={submitRef}
        type="button"
        onClick={handleDeposit}
        disabled={loading || processing || hasPendingDeposit || cashInHandNum < 1 || !amount || parseFloat(amount) < 1}
        className="w-full py-2.5 rounded-lg bg-black text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || processing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : null}
        {loading ? "Creating…" : processing ? "Complete payment…" : method === "bank" ? "Submit Bank Deposit" : "Deposit"}
      </button>
    </div>
  )
}












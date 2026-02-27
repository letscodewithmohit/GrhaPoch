import { useState, useEffect, useMemo, useCallback } from "react"
import { motion as Motion } from "framer-motion"
import { useNavigate, useParams } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft, Calendar, Megaphone, DollarSign, Edit } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { campaignAPI } from "@/lib/api"
import { loadRazorpayScript } from "@/lib/utils/razorpay"

const formatDate = (value, withTime = false) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return withTime
    ? date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const labelStatus = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "Pending")

export default function AdDetailsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [actionError, setActionError] = useState("")
  const [adData, setAdData] = useState(null)

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true })
    const raf = (time) => {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    return () => lenis.destroy()
  }, [])

  const loadAdvertisement = useCallback(async () => {
    setLoading(true)
    try {
      const response = await campaignAPI.getRestaurantAdvertisementById(id)
      setAdData(response?.data?.data?.advertisement || null)
    } catch {
      setAdData(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadAdvertisement()
  }, [loadAdvertisement])

  const coverMedia = useMemo(() => adData?.bannerImage || adData?.videoMedia?.url || adData?.fileMedia?.url || "", [adData])
  const isVideo = useMemo(() => !adData?.bannerImage && adData?.videoMedia?.resourceType === "video", [adData])
  const normalizedStatus = String(adData?.status || "").trim().toLowerCase()
  const normalizedPaymentStatus = String(adData?.paymentStatus || "").trim().toLowerCase()
  const canPay = Boolean(adData?.canPay) || (["payment_pending", "approved"].includes(normalizedStatus) && normalizedPaymentStatus === "unpaid")

  const handlePayNow = async () => {
    if (!adData?.id) return
    setActionError("")
    setPaymentLoading(true)

    try {
      const orderResponse = await campaignAPI.createAdvertisementPaymentOrder(adData.id)
      const payment = orderResponse?.data?.data?.payment
      if (!payment?.orderId || !payment?.keyId) throw new Error("Unable to initiate payment")

      await loadRazorpayScript()
      if (!window.Razorpay) throw new Error("Razorpay SDK not loaded")

      const razorpay = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency || "INR",
        name: "GrhaPoch Partner",
        description: `Advertisement ${adData.adId || ""}`,
        order_id: payment.orderId,
        theme: { color: "#2563eb" },
        modal: { ondismiss: () => setPaymentLoading(false) },
        handler: async (response) => {
          try {
            await campaignAPI.verifyAdvertisementPayment(adData.id, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            await loadAdvertisement()
          } catch (error) {
            setActionError(error?.response?.data?.message || "Payment verification failed")
          } finally {
            setPaymentLoading(false)
          }
        },
      })

      razorpay.open()
    } catch (error) {
      setActionError(error?.response?.data?.message || error?.message || "Failed to start payment")
      setPaymentLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Ads Details</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading && <p className="text-sm text-gray-500 text-center py-10">Loading advertisement...</p>}
        {!loading && !adData && <p className="text-sm text-gray-500 text-center py-10">Advertisement not found</p>}

        {!loading && adData && (
          <>
            <Motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="bg-white border border-gray-100"><CardContent className="p-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">Ads ID #{adData.adId}</h2>
                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">{labelStatus(adData.effectiveStatus || adData.status)}</span>
              </CardContent></Card>
            </Motion.div>

            <Card className="bg-white border border-gray-100"><CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3"><Calendar className="w-5 h-5 text-blue-600 mt-0.5" /><div><p className="text-xs text-gray-500">Ads Created</p><p className="text-sm font-medium text-gray-900">{formatDate(adData.createdAt, true)}</p></div></div>
              <div className="flex items-start gap-3"><Calendar className="w-5 h-5 text-blue-600 mt-0.5" /><div><p className="text-xs text-gray-500">Duration</p><p className="text-sm font-medium text-gray-900">{formatDate(adData.startDate)} - {formatDate(adData.endDate || adData.validityDate)}</p></div></div>
              <div className="flex items-start gap-3"><Megaphone className="w-5 h-5 text-blue-600 mt-0.5" /><div><p className="text-xs text-gray-500">Ads Details</p><p className="text-sm font-bold text-gray-900">{adData.category}</p></div></div>
              <div className="flex items-start gap-3"><DollarSign className="w-5 h-5 text-blue-600 mt-0.5" /><div><p className="text-xs text-gray-500">Payment Status</p><p className="text-sm font-medium text-red-600">{labelStatus(adData.paymentStatus)}</p></div></div>
              {canPay && (
                <Button onClick={handlePayNow} disabled={paymentLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
                  {paymentLoading ? "Processing..." : "Pay Now To Activate"}
                </Button>
              )}
              {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            </CardContent></Card>

            <Card className="bg-white border border-gray-100"><CardContent className="p-4">
              <div><h3 className="text-sm font-bold text-gray-900 mb-1">Title</h3><p className="text-sm text-gray-600">{adData.title}</p></div>
            </CardContent></Card>

            <Card className="bg-white border border-gray-100"><CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Banner / Media</h3>
              <div className="w-full h-48 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {!coverMedia && <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">No media</div>}
                {coverMedia && isVideo && <video src={coverMedia} className="w-full h-full object-cover" controls />}
                {coverMedia && !isVideo && <img src={coverMedia} alt="Advertisement banner" className="w-full h-full object-cover" />}
              </div>
            </CardContent></Card>
          </>
        )}
      </div>

      {!loading && adData && !canPay && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40 md:relative md:bottom-auto md:border-t-0 md:px-4 md:py-4 md:mt-6">
          {adData.adType === "legacy" ? (
            <Button onClick={() => navigate(`/restaurant/advertisements/${adData.id}/edit`)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
              <Edit className="w-5 h-5" />
              <span>Edit Ads</span>
            </Button>
          ) : (
            <Button onClick={() => navigate("/restaurant/advertisements")} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
              <span>Back To Ad List</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

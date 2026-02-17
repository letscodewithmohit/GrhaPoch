import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { fetchDeliveryWallet } from "../utils/deliveryWalletState"
import { formatCurrency } from "../../restaurant/utils/currency"

export default function CustomerTipsBalancePage() {
  const navigate = useNavigate()
  const [walletData, setWalletData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadWallet = async () => {
      try {
        setLoading(true)
        const data = await fetchDeliveryWallet()
        setWalletData(data)
      } catch (error) {
        console.error("Error loading wallet for tips:", error)
      } finally {
        setLoading(false)
      }
    }
    loadWallet()
  }, [])

  // Calculate tips from transactions
  const tipsTransactions = walletData?.transactions?.filter(t => t.type === 'tip' && t.status === 'Completed') || []
  const totalTips = tipsTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)

  // Tips withdrawn - withdrawals can be specified for tips or just general withdrawals
  // For now, let's assume all tips are added to balance and withdrawn via regular withdrawal
  // If there's a specific withdrawal type for tips, we can filter for it.
  const tipsWithdrawn = 0 // Placeholder if not explicitly tracked
  const withdrawableAmount = totalTips - tipsWithdrawn

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-600">Loading tips data...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen  bg-white text-black">

      {/* Top Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <ArrowLeft onClick={() => navigate(-1)} size={22} className="cursor-pointer" />
        <h1 className="text-lg font-semibold">Customer tips</h1>
      </div>

      {/* Warning Banner */}
      {withdrawableAmount <= 0 && (
        <div className="bg-yellow-400 p-4 flex items-start gap-3 text-black">
          <ArrowLeft size={20} className="hidden" /> {/* Spacer */}
          <AlertTriangle size={20} className="shrink-0" />
          <div className="text-sm leading-tight">
            <p className="font-semibold">Withdraw currently disabled</p>
            <p className="text-xs">Withdrawable amount is {formatCurrency(withdrawableAmount)}</p>
          </div>
        </div>
      )}

      {/* Withdraw Section */}
      <div className="px-5 py-6 flex flex-col items-start">
        <p className="text-sm text-gray-600 mb-1">Customer tips balance</p>
        <p className="text-4xl font-bold mb-5">{formatCurrency(totalTips)}</p>

        <button
          disabled={withdrawableAmount <= 0}
          className={`w-full font-medium py-3 rounded-lg transition-colors ${withdrawableAmount > 0
              ? "bg-black text-white hover:bg-gray-800"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          onClick={() => navigate("/delivery/payout")}
        >
          Withdraw
        </button>
      </div>

      {/* Section Header */}
      <div className=" bg-gray-100 py-2 pt-4 text-center text-xs font-semibold text-gray-600 uppercase">
        Tips Details
      </div>

      {/* Detail Rows */}
      <div className="px-4 pt-2">
        <DetailRow label="Total Tips Earned" value={formatCurrency(totalTips)} />
        <DetailRow label="Tips Withdrawn" value={formatCurrency(tipsWithdrawn)} />
        <DetailRow label="Withdrawable Amount" value={formatCurrency(withdrawableAmount)} />
      </div>


      {/* 100% TIP TRANSFER GUARANTEE Card */}
      <div className="bg-gray-50  rounded-xl p-2 shadow-sm border border-gray-50 fixed bottom-0 w-[90%] mx-auto left-1/2 transform -translate-x-1/2 mb-4">
        {/* Icon + Label */}
        <div className="flex items-center gap-2 mb-2">
          {/* Circular Icon */}
          <div className="relative shrink-0 scale-75">
            <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
              {/* Outer circle */}
              <circle cx="40" cy="40" r="38" fill="white" stroke="#9ca3af" strokeWidth="2" />
              {/* Checkmark */}
              <path d="M 25 40 L 35 50 L 55 30" stroke="#9ca3af" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {/* Circular text path */}
              <defs>
                <path id="tipCircle" d="M 40,40 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" fill="none" />
              </defs>
              <text fill="#9ca3af" fontSize="7" fontWeight="600" letterSpacing="0.5">
                <textPath href="#tipCircle" startOffset="0%">
                  100% TIP TRANSFER
                </textPath>
              </text>
            </svg>
          </div>

          {/* Heading */}
          <div className="flex-1">
            <h2 className="text-sm md:text-md font-semibold text-gray-400 truncate">
              100% TIP TRANSFER GUARANTEE
            </h2>
          </div>
        </div>

        {/* Dotted Separator */}
        <div className="border-t border-dashed border-gray-400 mb-4"></div>

        {/* Bullet Points */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
            <p className="text-gray-400 text-sm md:text-base">
              Tips are never used to settle your deductions.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
            <p className="text-gray-400 text-sm md:text-base">
              Tips are transferred to your bank account weekly, if not withdrawn.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

/* Reusable row component */
function DetailRow({ label, value, multiline = false }) {
  return (
    <div className="py-3 flex justify-between items-start border-b border-gray-100">
      <div className={`text-sm ${multiline ? "" : "font-medium"} text-gray-800`}>
        {label}
      </div>
      <div className="text-sm font-semibold text-black">{value}</div>
    </div>
  )
}

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import { deliveryAPI } from "@/lib/api"

export default function Payout() {
  const navigate = useNavigate()
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Fetch withdrawal transactions
  useEffect(() => {
    const loadWithdrawals = async () => {
      try {
        setLoading(true)
        
        const response = await deliveryAPI.getWithdrawalRequests({
          limit: 1000
        })
        const fetchedRequests = response?.data?.data?.requests || []
        
        // Format requests for display
        const formattedTransactions = fetchedRequests.map(r => ({
          id: r.id || r._id,
          amount: r.amount || 0,
          status: r.status || 'Pending',
          date: r.requestedAt || r.createdAt ? new Date(r.requestedAt || r.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'N/A',
          processedAt: r.processedAt ? new Date(r.processedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
          rejectionReason: r.rejectionReason || null,
          paymentMethod: r.paymentMethod || 'admin_select',
          bankDetails: r.bankDetails || null,
          upiId: r.upiId || null,
          qrCode: r.qrCode || null,
          paymentScreenshot: r.paymentScreenshot || null
        }))
        
        // Sort by date (newest first)
        formattedTransactions.sort((a, b) => {
          const dateA = new Date(a.date)
          const dateB = new Date(b.date)
          return dateB - dateA
        })
        
        setWithdrawals(formattedTransactions)
      } catch (error) {
        console.error('Error loading withdrawal transactions:', error)
        setWithdrawals([])
      } finally {
        setLoading(false)
      }
    }
    
    loadWithdrawals()

    // Listen for wallet state updates
    const handleWalletUpdate = () => {
      loadWithdrawals()
    }

    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
    window.addEventListener('storage', handleWalletUpdate)
    
    return () => {
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
      window.removeEventListener('storage', handleWalletUpdate)
    }
  }, [])
  
  // Get status icon and color
  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
      case 'processed':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        }
      case 'pending':
        return {
          icon: Clock,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        }
      case 'denied':
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        }
      default:
    return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        }
    }
  }

  const formatMethod = (method) => {
    if (!method) return "N/A"
    const map = {
      admin_select: "Admin Will Select",
      bank_transfer: "Bank Transfer",
      upi: "UPI",
      qr_code: "QR Code",
      card: "Card"
    }
    return map[method] || String(method).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Withdrawal Transactions</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-600 text-base">Loading transactions...</p>
          </div>
        ) : withdrawals.length > 0 ? (
          <div className="space-y-4">
            {withdrawals.map((withdrawal, index) => {
              const statusInfo = getStatusInfo(withdrawal.status)
              const StatusIcon = statusInfo.icon
              
              return (
            <div
                  key={withdrawal.id || index}
                  className={`bg-white rounded-xl p-4 shadow-sm border ${statusInfo.borderColor} transition-all hover:shadow-md`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                          {withdrawal.status}
                        </span>
                      </div>
                      <p className="text-gray-900 text-xl font-bold mb-1">
                        {formatCurrency(withdrawal.amount)}
                      </p>
                      
                      <div className="flex flex-col gap-1 mb-4">
                        <span className="text-[10px] uppercase text-gray-400 font-bold tracking-tight">Payout Mode</span>
                        <span className="text-sm font-semibold capitalize text-gray-700">
                           {withdrawal.paymentMethod && !['admin_select', 'pending', '', 'none'].includes(withdrawal.paymentMethod.toLowerCase().replace(/[^a-z]/g, ''))
                             ? formatMethod(withdrawal.paymentMethod)
                             : 'Standard Bank Selection'}
                        </span>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        {withdrawal.paymentMethod?.toLowerCase().includes('bank') && withdrawal.bankDetails && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Bank Account</span>
                            <span className="text-sm font-medium text-gray-800">
                              {withdrawal.bankDetails.bankName || "-"} · {withdrawal.bankDetails.accountNumber ? `****${withdrawal.bankDetails.accountNumber.slice(-4)}` : "-"}
                            </span>
                          </div>
                        )}
                        
                        {withdrawal.paymentMethod?.toLowerCase().includes('upi') && withdrawal.upiId && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">UPI ID</span>
                            <span className="text-sm font-medium text-gray-800">{withdrawal.upiId}</span>
                          </div>
                        )}

                        {withdrawal.paymentMethod?.toLowerCase().includes('qr') && withdrawal.qrCode?.url && (
                          <a
                            href={withdrawal.qrCode.url}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
                          >
                            Download QR Code
                          </a>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1 tracking-tight">Requested</span>
                            <span className="text-xs text-gray-600 font-medium">{withdrawal.date}</span>
                          </div>
                          {withdrawal.processedAt && (
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase text-gray-400 font-bold mb-1 tracking-tight">Processed</span>
                              <span className="text-xs text-gray-600 font-medium">{withdrawal.processedAt}</span>
                            </div>
                          )}
                        </div>

                        {withdrawal.rejectionReason && (
                          <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                            <span className="text-[10px] uppercase text-red-500 font-bold mb-1 block">Rejection Reason</span>
                            <p className="text-xs text-red-600 leading-relaxed font-medium">
                              {withdrawal.rejectionReason}
                            </p>
                          </div>
                        )}

                        {withdrawal.paymentScreenshot?.url && (
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2">
                            <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wide">Payment Proof (OP)</p>
                            <a
                              href={withdrawal.paymentScreenshot.url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                              Download Original Proof
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
              </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 text-lg font-semibold mb-2">No withdrawal transactions</p>
            <p className="text-gray-600 text-sm text-center max-w-xs">
              You haven't made any withdrawal requests yet. Your withdrawal history will appear here.
            </p>
        </div>
        )}
      </div>
    </div>
  )
}

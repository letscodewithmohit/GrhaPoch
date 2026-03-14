import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Wallet, Check } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { restaurantAPI } from "@/lib/api"

export default function WithdrawalHistoryPage() {
  const navigate = useNavigate()
  const [withdrawalHistoryTab, setWithdrawalHistoryTab] = useState('pending')
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [loadingWithdrawalRequests, setLoadingWithdrawalRequests] = useState(false)

  // Fetch withdrawal requests on mount
  useEffect(() => {
    const fetchWithdrawalRequests = async () => {
      try {
        setLoadingWithdrawalRequests(true)
        const response = await restaurantAPI.getWithdrawalRequests()
        if (response.data?.success && response.data?.data?.requests) {
          setWithdrawalRequests(response.data.data.requests)
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          console.error('❌ Error fetching withdrawal requests:', error)
        }
      } finally {
        setLoadingWithdrawalRequests(false)
      }
    }

    fetchWithdrawalRequests()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant/hub-finance")}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Withdrawal History</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 pt-4 border-b border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={() => setWithdrawalHistoryTab('pending')}
            className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
              withdrawalHistoryTab === 'pending'
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Withdrawal Pending
          </button>
          <button
            onClick={() => setWithdrawalHistoryTab('successful')}
            className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
              withdrawalHistoryTab === 'successful'
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Withdrawal Successful
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {loadingWithdrawalRequests ? (
          <div className="py-8 text-center text-gray-500 flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-2"></div>
            <span>Loading transactions...</span>
          </div>
        ) : (
          <>
            {withdrawalHistoryTab === 'pending' ? (
              <div className="space-y-4">
                {withdrawalRequests
                  .filter(req => req.status === 'Pending')
                  .length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg font-medium">No pending requests</p>
                  </div>
                ) : (
                  withdrawalRequests
                    .filter(req => req.status === 'Pending')
                    .map((request) => (
                      <div
                        key={request.id || request._id}
                        className="bg-white rounded-xl p-5 border border-blue-100 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Pending</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400">#{ (request.id || request._id || '').slice(-6).toUpperCase() }</span>
                        </div>

                        <p className="text-2xl font-bold text-gray-900 mb-4">
                          ₹{request.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>

                        <div className="space-y-3 pt-4 border-t border-gray-50">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Payout Method</span>
                            <span className="text-sm font-medium text-gray-700 capitalize">
                              {request.paymentMethod === 'admin_select' ? 'Admin will select' : request.paymentMethod?.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Requested On</span>
                            <span className="text-sm text-gray-600">
                              {request.requestedAt ? new Date(request.requestedAt).toLocaleString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              }) : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawalRequests
                  .filter(req => ['Approved', 'Processed', 'Successful', 'Completed'].includes(req.status))
                  .length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg font-medium">No successful withdrawals</p>
                  </div>
                ) : (
                  withdrawalRequests
                    .filter(req => ['Approved', 'Processed', 'Successful', 'Completed'].includes(req.status))
                    .sort((a, b) => new Date(b.processedAt || b.updatedAt || 0) - new Date(a.processedAt || a.updatedAt || 0))
                    .map((request) => (
                      <div
                        key={request.id || request._id}
                        className="bg-white rounded-xl p-5 border border-green-100 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full">
                            <Check className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Approved</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400">#{ (request.id || request._id || '').slice(-6).toUpperCase() }</span>
                        </div>

                        <p className="text-2xl font-bold text-gray-900 mb-1">
                          ₹{request.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        
                        <div className="flex flex-col gap-1 mb-4">
                          <span className="text-[10px] uppercase text-gray-400 font-bold tracking-tight">Payout Mode</span>
                          <span className="text-sm font-semibold capitalize text-gray-700">
                             {request.paymentMethod && !['admin_select', 'pending', '', 'none'].includes(request.paymentMethod.toLowerCase().replace(/[^a-z]/g, ''))
                               ? request.paymentMethod.replace(/_/g, ' ') 
                               : 'Standard Bank Selection'}
                          </span>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-gray-100">
                          {/* Payment Method Details */}
                          {request.paymentMethod?.toLowerCase().includes('upi') && request.upiId && (
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">UPI ID</span>
                              <span className="text-sm font-medium text-gray-800">{request.upiId}</span>
                            </div>
                          )}

                          {(request.paymentMethod?.toLowerCase().includes('bank') || request.paymentMethod?.toLowerCase().includes('transfer')) && request.bankDetails && (
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Bank Account</span>
                              <span className="text-sm font-medium text-gray-800">
                                {request.bankDetails.accountNumber ? `****${request.bankDetails.accountNumber.slice(-4)}` : 'N/A'} - {request.bankDetails.bankName || ''}
                              </span>
                            </div>
                          )}

                          {request.paymentMethod?.toLowerCase().includes('qr') && request.qrCode?.url && (
                             <a 
                               href={request.qrCode.url} 
                               target="_blank" 
                               rel="noreferrer"
                               className="text-xs font-bold text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
                               download
                             >
                               Download QR Code
                             </a>
                          )}

                          {/* Dates */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Requested</span>
                              <span className="text-[11px] text-gray-600">
                                {request.requestedAt ? new Date(request.requestedAt).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                }) : 'N/A'}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Processed</span>
                              <span className="text-[11px] text-gray-600">
                                {request.processedAt ? new Date(request.processedAt).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                }) : 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Payment Screenshot */}
                          {request.paymentScreenshot?.url && (
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2">
                               <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wide">Payment Proof (OP)</p>
                               <a 
                                 href={request.paymentScreenshot.url} 
                                 target="_blank" 
                                 rel="noreferrer"
                                 className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                 download
                               >
                                 Download Original Proof
                               </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}


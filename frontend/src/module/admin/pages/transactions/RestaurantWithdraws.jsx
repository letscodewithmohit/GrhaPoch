import { useState, useEffect, useMemo } from "react"
import { Search, Download, ChevronDown, Eye, Settings, Building, ArrowUpDown, FileText, FileSpreadsheet, Code, Check, Columns, CheckCircle, XCircle, Loader2, Wallet } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { exportTransactionsToExcel, exportTransactionsToPDF } from "../../components/transactions/transactionsExportUtils"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

export default function RestaurantWithdraws() {
  const [activeTab, setActiveTab] = useState("Pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [withdraws, setWithdraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedWithdraw, setSelectedWithdraw] = useState(null)
  const [processingAction, setProcessingAction] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveScreenshot, setApproveScreenshot] = useState(null)
  const [approveUploading, setApproveUploading] = useState(false)
  const [approveMethod, setApproveMethod] = useState("")
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    amount: true,
    restaurant: true,
    restaurantId: true,
    restaurantAddress: false,
    requestTime: true,
    payoutMethod: true,
    status: true,
    actions: true,
  })

  // Fetch withdrawal requests
  useEffect(() => {
    fetchWithdrawals()
  }, [activeTab])

  const fetchWithdrawals = async () => {
    try {
      setLoading(true)
      const status = activeTab === "All" ? undefined : activeTab
      const response = await adminAPI.getWithdrawalRequests({ status, search: searchQuery || undefined })
      if (response.data?.success) {
        setWithdraws(response.data.data?.requests || [])
      } else {
        console.error('Failed to fetch withdrawals:', response.data?.message)
        toast.error('Failed to fetch withdrawal requests')
      }
    } catch (error) {
      console.error('Error fetching withdrawals:', error)
      toast.error('Failed to fetch withdrawal requests')
    } finally {
      setLoading(false)
    }
  }

  // Refetch when search changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== undefined) {
        fetchWithdrawals()
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredWithdraws = useMemo(() => {
    let result = [...withdraws]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(w =>
        w.restaurantName?.toLowerCase().includes(query) ||
        w.restaurantIdString?.toLowerCase().includes(query) ||
        w.amount?.toString().includes(query)
      )
    }

    return result
  }, [withdraws, searchQuery])

  const getStatusBadge = (status) => {
    if (status === "Approved") {
      return "bg-green-100 text-green-700"
    }
    if (status === "Pending") {
      return "bg-blue-100 text-blue-700"
    }
    if (status === "Rejected") {
      return "bg-red-100 text-red-700"
    }
    return "bg-slate-100 text-slate-700"
  }

  const handleViewWithdraw = (withdraw) => {
    setSelectedWithdraw(withdraw)
    setIsViewOpen(true)
  }

  const handleApprove = async () => {
    if (!selectedWithdraw?.id) return
    if (!approveMethod) {
      toast.error("Select payout method to approve")
      return
    }
    if (!approveScreenshot?.url) {
      toast.error("Upload payment screenshot to approve")
      return
    }
    try {
      setProcessingAction(selectedWithdraw.id)
      const response = await adminAPI.approveWithdrawalRequest(selectedWithdraw.id, {
        paymentMethod: approveMethod,
        paymentScreenshot: approveScreenshot
      })
      if (response?.data?.success) {
        toast.success("Withdrawal request approved successfully")
        setShowApproveModal(false)
        setApproveScreenshot(null)
        setApproveMethod("")
        setSelectedWithdraw(null)
        fetchWithdrawals()
      } else {
        toast.error(response?.data?.message || "Failed to approve")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to approve withdrawal request")
    } finally {
      setProcessingAction(null)
    }
  }

  const openApproveModal = (withdraw) => {
    setSelectedWithdraw(withdraw)
    setApproveScreenshot(null)
    const bank = withdraw?.bankDetails
    const hasBank = !!(bank?.accountHolderName && bank?.accountNumber && bank?.ifscCode)
    const hasUpi = !!(withdraw?.upiId)
    const hasQr = !!(withdraw?.qrCode?.url)

    let initial = ""
    if (hasBank) initial = "bank_transfer"
    else if (hasUpi) initial = "upi"
    else if (hasQr) initial = "qr_code"

    setApproveMethod(initial)
    setShowApproveModal(true)
  }

  const handleApproveScreenshotChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setApproveUploading(true)
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: "restaurant/withdrawal-screenshots" })
      const data = res?.data?.data
      if (data?.url) {
        setApproveScreenshot({ url: data.url, publicId: data.publicId })
        toast.success("Payment screenshot uploaded")
      }
    } catch (error) {
      toast.error("Failed to upload screenshot")
    } finally {
      setApproveUploading(false)
    }
  }

  const handleReject = async (id) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }

    try {
      setProcessingAction(id)
      const response = await adminAPI.rejectWithdrawalRequest(id, rejectionReason)
      if (response.data?.success) {
        toast.success('Withdrawal request rejected successfully')
        setShowRejectModal(false)
        setRejectionReason("")
        fetchWithdrawals()
      } else {
        toast.error(response.data?.message || 'Failed to reject withdrawal request')
      }
    } catch (error) {
      console.error('Error rejecting withdrawal:', error)
      toast.error(error.response?.data?.message || 'Failed to reject withdrawal request')
    } finally {
      setProcessingAction(null)
    }
  }

  const getMethodAvailability = (withdraw) => {
    if (!withdraw) return {}
    const bank = withdraw.bankDetails
    const hasBank = !!(bank?.accountHolderName && bank?.accountNumber && bank?.ifscCode)
    const bankLast4 = bank?.accountNumber ? String(bank.accountNumber).slice(-4) : ""
    const bankLabel = hasBank
      ? `A/C ${bank.accountNumber} · ${bank.bankName || "Bank"}`
      : "Bank details not provided"

    const upiId = withdraw.upiId ? String(withdraw.upiId).trim() : ""
    const hasUpi = !!upiId
    const upiLabel = hasUpi ? `UPI ID: ${upiId}` : "UPI ID not provided"

    const qrUrl = withdraw.qrCode?.url || ""
    const hasQr = !!qrUrl
    const qrLabel = hasQr ? "QR code uploaded" : "QR code not provided"

    return { hasBank, bankLabel, hasUpi, upiLabel, hasQr, qrLabel, qrUrl }
  }

  const payoutAvailability = getMethodAvailability(selectedWithdraw)

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    } catch (e) {
      return dateString
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return '₹0.00'
    return `₹${parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const formatMethod = (method) => {
    if (!method) return "N/A"
    const map = {
      admin_select: "Admin Select",
      bank_transfer: "Bank Transfer",
      upi: "UPI",
      qr_code: "QR Code",
      card: "Card"
    }
    return map[method] || String(method).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  }

  const handleExport = async (format) => {
    if (filteredWithdraws.length === 0) {
      toast.error("No data to export.")
      return
    }
    const headers = [
      { key: "sl", label: "SI" },
      { key: "amount", label: "Amount" },
      { key: "restaurantName", label: "Restaurant Name" },
      { key: "restaurantIdString", label: "Restaurant ID" },
      { key: "requestTime", label: "Request Time" },
      { key: "payoutMethod", label: "Payout Method" },
      { key: "processedTime", label: "Approved/Rejected Time" },
      { key: "processedBy", label: "Processed By" },
      { key: "status", label: "Status" },
      { key: "rejectionReason", label: "Rejection Reason" },
    ]
    const exportData = filteredWithdraws.map((w, index) => ({
      sl: index + 1,
      amount: formatCurrency(w.amount),
      restaurantName: w.restaurantName || 'N/A',
      restaurantIdString: w.restaurantIdString || 'N/A',
      requestTime: formatDate(w.requestedAt || w.createdAt),
      payoutMethod: formatMethod(w.paymentMethod),
      processedTime: w.processedAt ? formatDate(w.processedAt) : '',
      processedBy: w.processedBy?.name ? `${w.processedBy.name}${w.processedBy.email ? ` (${w.processedBy.email})` : ''}` : '',
      status: w.status,
      rejectionReason: w.rejectionReason || ''
    }))
    switch (format) {
      case "excel":
        exportTransactionsToExcel(exportData, headers, "restaurant_withdraws_full_details")
        break
      case "pdf":
        await exportTransactionsToPDF(exportData, headers, "restaurant_withdraws_full_details", "Restaurant Withdraws Report")
        break
      default: break
    }
  }

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      amount: true,
      restaurant: true,
      restaurantId: true,
      restaurantAddress: false,
      requestTime: true,
      payoutMethod: true,
      status: true,
      actions: true,
    })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Building className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Withdraw Transaction</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex gap-2 border-b border-slate-200">
            {["All", "Pending", "Approved", "Rejected"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="absolute top-6 right-6 p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-600" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Withdraw Request Table</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredWithdraws.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Ex: search by Restaurant name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer flex items-center gap-2">
                    <Code className="w-4 h-4" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading withdrawal requests...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {visibleColumns.si && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>SI</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                      </div>
                    </th>}
                    {visibleColumns.amount && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>}
                    {visibleColumns.restaurant && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant Name</th>}
                    {visibleColumns.restaurantId && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant ID</th>}
                    {visibleColumns.requestTime && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Request Time</th>}
                    {visibleColumns.payoutMethod && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Payout Method</th>}
                    {visibleColumns.status && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>}
                    {visibleColumns.actions && <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredWithdraws.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Building className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No Data Found</p>
                          <p className="text-sm text-slate-500">No withdraw requests match your filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredWithdraws.map((withdraw, index) => (
                      <tr key={withdraw.id} className="hover:bg-slate-50 transition-colors">
                        {visibleColumns.si && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                        </td>}
                        {visibleColumns.amount && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">
                            {formatCurrency(withdraw.amount)}
                          </span>
                        </td>}
                        {visibleColumns.restaurant && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{withdraw.restaurantName || 'N/A'}</span>
                        </td>}
                        {visibleColumns.restaurantId && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{withdraw.restaurantIdString || 'N/A'}</span>
                        </td>}
                        {visibleColumns.requestTime && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{formatDate(withdraw.requestedAt || withdraw.createdAt)}</span>
                        </td>}
                        {visibleColumns.payoutMethod && <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{formatMethod(withdraw.paymentMethod)}</span>
                        </td>}
                        {visibleColumns.status && <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(withdraw.status)}`}>
                            {withdraw.status}
                          </span>
                        </td>}
                        {visibleColumns.actions && <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewWithdraw(withdraw)}
                              className="p-2 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4 text-orange-600" />
                            </button>
                            {withdraw.status === 'Pending' && (
                              <>
                                <button
                                  onClick={() => openApproveModal(withdraw)}
                                  disabled={processingAction === withdraw.id}
                                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Approve"
                                >
                                  {processingAction === withdraw.id ? (
                                    <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedWithdraw(withdraw)
                                    setShowRejectModal(true)
                                  }}
                                  disabled={processingAction === withdraw.id}
                                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Reject"
                                >
                                  <XCircle className="w-4 h-4 text-red-600" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
              <DialogTitle>Withdrawal request details</DialogTitle>
            </DialogHeader>
            {selectedWithdraw && (
              <div className="px-6 pb-6 pt-4 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Amount</p>
                    <p className="text-base font-semibold text-slate-900 mt-1">{formatCurrency(selectedWithdraw.amount)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Status</p>
                    <div className="mt-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(selectedWithdraw.status)}`}>
                        {selectedWithdraw.status}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Request time</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{formatDate(selectedWithdraw.requestedAt || selectedWithdraw.createdAt)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Processed time</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedWithdraw.processedAt ? formatDate(selectedWithdraw.processedAt) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Restaurant Name</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedWithdraw.restaurantName || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Restaurant ID</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedWithdraw.restaurantIdString || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Payout method</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedWithdraw.paymentMethod || "Admin Select"}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Payout details</p>
                    {selectedWithdraw.paymentMethod === "admin_select" && (
                      <span className="text-xs text-slate-500">Admin selects method</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">Bank transfer</p>
                      {selectedWithdraw.bankDetails?.accountNumber ? (
                        <div className="text-xs text-slate-700 mt-2 space-y-1">
                          <p>{selectedWithdraw.bankDetails.accountHolderName || "N/A"}</p>
                          <p>
                            A/C {selectedWithdraw.bankDetails.accountNumber} · {selectedWithdraw.bankDetails.bankName || "N/A"}
                          </p>
                          <p>IFSC: {selectedWithdraw.bankDetails.ifscCode || "N/A"}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-rose-600 mt-2">Not provided</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">UPI</p>
                      {selectedWithdraw.upiId ? (
                        <p className="text-xs text-slate-700 mt-2">{selectedWithdraw.upiId}</p>
                      ) : (
                        <p className="text-xs text-rose-600 mt-2">Not provided</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">QR Code</p>
                      {selectedWithdraw.qrCode?.url ? (
                        <a
                          href={selectedWithdraw.qrCode.url}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 mt-2 inline-flex"
                        >
                          Download QR code
                        </a>
                      ) : (
                        <p className="text-xs text-rose-600 mt-2">Not provided</p>
                      )}
                    </div>
                  </div>
                </div>

                {selectedWithdraw.paymentScreenshot?.url && (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Payment screenshot</p>
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={selectedWithdraw.paymentScreenshot.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Download screenshot
                      </a>
                      <img
                        src={selectedWithdraw.paymentScreenshot.url}
                        alt="Payment screenshot"
                        className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                      />
                    </div>
                  </div>
                )}

                {selectedWithdraw.rejectionReason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold text-red-600 uppercase">Rejection reason</p>
                    <p className="text-sm font-medium text-red-700 mt-2">{selectedWithdraw.rejectionReason}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="px-6 pb-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setIsViewOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approve Modal */}
        <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
          <DialogContent className="max-w-lg bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Approve Withdrawal Request</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Payout Method <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {[
                    { value: "bank_transfer", label: "Bank Transfer", available: payoutAvailability.hasBank, description: payoutAvailability.bankLabel },
                    { value: "upi", label: "UPI", available: payoutAvailability.hasUpi, description: payoutAvailability.upiLabel },
                    { value: "qr_code", label: "QR Code", available: payoutAvailability.hasQr, description: payoutAvailability.qrLabel }
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${opt.available ? "border-slate-200 hover:border-blue-300" : "border-slate-100 opacity-60"}`}
                    >
                      <input
                        type="radio"
                        name="approveMethod"
                        value={opt.value}
                        checked={approveMethod === opt.value}
                        onChange={() => setApproveMethod(opt.value)}
                        disabled={!opt.available}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {!payoutAvailability.hasBank && !payoutAvailability.hasUpi && !payoutAvailability.hasQr && (
                  <p className="text-xs text-rose-600 mt-2">
                    No payout details available. Ask the restaurant to update profile.
                  </p>
                )}
                {payoutAvailability.qrUrl && (
                  <a
                    href={payoutAvailability.qrUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 mt-2 inline-flex"
                  >
                    Download QR code
                  </a>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Payment Screenshot <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleApproveScreenshotChange}
                  className="w-full text-sm"
                />
                {approveUploading && <p className="text-xs text-slate-500 mt-1">Uploading...</p>}
                {approveScreenshot?.url && (
                  <div className="mt-2">
                    <img src={approveScreenshot.url} className="h-20 w-20 object-cover rounded border" alt="Proof" />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={processingAction === selectedWithdraw?.id || approveUploading || !approveMethod || !approveScreenshot}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processingAction === selectedWithdraw?.id ? "Approving..." : "Approve & Mark Paid"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Modal */}
        <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
          <DialogContent className="max-w-md bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Reject Withdrawal Request</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={4}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason("")
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedWithdraw && handleReject(selectedWithdraw.id)}
                disabled={!rejectionReason.trim() || processingAction === selectedWithdraw?.id}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingAction === selectedWithdraw?.id ? 'Rejecting...' : 'Reject'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="max-w-md bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Table Settings
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Toggle Columns</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(visibleColumns).map(([key, isVisible]) => (
                    <div key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`toggle-${key}`}
                        checked={isVisible}
                        onChange={() => toggleColumn(key)}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`toggle-${key}`} className="ml-2 text-sm text-slate-700 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex justify-between">
              <button
                onClick={resetColumns}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset Columns
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
              >
                Apply
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

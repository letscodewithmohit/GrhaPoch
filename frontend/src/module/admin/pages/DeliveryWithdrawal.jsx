import { useState, useEffect, useMemo } from "react"
import { Search, Wallet, Eye, CheckCircle, XCircle, Loader2, Package } from "lucide-react"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const TABS = [
  { key: "Pending", label: "Pending" },
  { key: "Approved", label: "Approved" },
  { key: "Rejected", label: "Rejected" },
]

export default function DeliveryWithdrawal() {
  const [activeTab, setActiveTab] = useState("Pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [processingAction, setProcessingAction] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveScreenshot, setApproveScreenshot] = useState(null)
  const [approveUploading, setApproveUploading] = useState(false)
  const [approveMethod, setApproveMethod] = useState("")

  useEffect(() => {
    fetchRequests()
  }, [activeTab])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getDeliveryWithdrawalRequests({
        status: activeTab,
        page: 1,
        limit: 200,
        search: searchQuery.trim() || undefined,
      })
      if (response?.data?.success) {
        setRequests(response.data.data?.requests || [])
      } else {
        toast.error(response?.data?.message || "Failed to fetch delivery withdrawal requests")
        setRequests([])
      }
    } catch (error) {
      console.error("Error fetching delivery withdrawal requests:", error)
      toast.error(error.response?.data?.message || "Failed to fetch delivery withdrawal requests")
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== undefined) fetchRequests()
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const q = searchQuery.toLowerCase().trim()
    return requests.filter(
      (r) =>
        r.deliveryName?.toLowerCase().includes(q) ||
        r.deliveryIdString?.toLowerCase().includes(q) ||
        r.deliveryPhone?.toLowerCase().includes(q) ||
        r.amount?.toString().includes(q)
    )
  }, [requests, searchQuery])

  const getStatusBadge = (status) => {
    if (status === "Approved" || status === "Processed") return "bg-green-100 text-green-700"
    if (status === "Pending") return "bg-amber-100 text-amber-700"
    if (status === "Rejected") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-700"
  }

  const handleView = (req) => {
    setSelectedRequest(req)
    setIsViewOpen(true)
  }

  const openApproveModal = (req) => {
    setSelectedRequest(req)
    setApproveScreenshot(null)
    const bank = req?.bankDetails
    const hasBank = !!(
      bank?.accountHolderName &&
      bank?.accountNumber &&
      bank?.ifscCode &&
      bank?.bankName
    )
    const hasUpi = !!(req?.upiId && String(req?.upiId).trim())
    const hasQr = !!(req?.qrCode?.url)
    const preferred = req?.paymentMethod ? String(req.paymentMethod).toLowerCase() : ""
    let initial = ""
    if (preferred === "bank_transfer" && hasBank) initial = "bank_transfer"
    else if (preferred === "upi" && hasUpi) initial = "upi"
    else if (preferred === "qr_code" && hasQr) initial = "qr_code"
    else if (hasBank) initial = "bank_transfer"
    else if (hasUpi) initial = "upi"
    else if (hasQr) initial = "qr_code"
    setApproveMethod(initial)
    setShowApproveModal(true)
  }

  const handleApproveScreenshotChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith("image/")) {
      toast.error("Please upload an image file")
      return
    }
    setApproveUploading(true)
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: "delivery/withdrawal-screenshots" })
      const data = res?.data?.data
      if (!data?.url) {
        throw new Error("Upload failed")
      }
      setApproveScreenshot({ url: data.url, publicId: data.publicId })
      toast.success("Payment screenshot uploaded")
    } catch (error) {
      console.error("Error uploading payment screenshot:", error)
      toast.error(error?.response?.data?.message || error.message || "Failed to upload screenshot")
    } finally {
      setApproveUploading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedRequest?.id) return
    if (!approveMethod) {
      toast.error("Select payout method to approve")
      return
    }
    if (!approveScreenshot?.url) {
      toast.error("Upload payment screenshot to approve")
      return
    }
    try {
      setProcessingAction(selectedRequest.id)
      const response = await adminAPI.approveDeliveryWithdrawal(selectedRequest.id, {
        paymentMethod: approveMethod,
        paymentScreenshot: approveScreenshot
      })
      if (response?.data?.success) {
        toast.success("Withdrawal request approved successfully")
        setShowApproveModal(false)
        setApproveScreenshot(null)
        setApproveMethod("")
        setSelectedRequest(null)
        fetchRequests()
      } else {
        toast.error(response?.data?.message || "Failed to approve")
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to approve withdrawal request"
      console.error("Error approving delivery withdrawal:", error?.response?.data || error, msg)
      toast.error(msg)
    } finally {
      setProcessingAction(null)
    }
  }

  const handleReject = async (id) => {
    try {
      setProcessingAction(id)
      const response = await adminAPI.rejectDeliveryWithdrawal(id, rejectionReason)
      if (response?.data?.success) {
        toast.success("Withdrawal request rejected successfully")
        setShowRejectModal(false)
        setRejectionReason("")
        setSelectedRequest(null)
        fetchRequests()
      } else {
        toast.error(response?.data?.message || "Failed to reject")
      }
    } catch (error) {
      console.error("Error rejecting delivery withdrawal:", error)
      toast.error(error.response?.data?.message || "Failed to reject withdrawal request")
    } finally {
      setProcessingAction(null)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    try {
      return new Date(dateString).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    } catch {
      return String(dateString)
    }
  }

  const formatCurrency = (amount) => {
    if (amount == null) return "₹0.00"
    return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

  const getMethodAvailability = (req) => {
    const bank = req?.bankDetails || null
    const hasBank = !!(
      bank?.accountHolderName &&
      bank?.accountNumber &&
      bank?.ifscCode &&
      bank?.bankName
    )
    const bankLast4 = bank?.accountNumber ? String(bank.accountNumber).slice(-4) : ""
    const bankLabel = hasBank
      ? `A/C ****${bankLast4} · ${bank.bankName || "Bank"}`
      : "Bank details not provided"

    const upiId = req?.upiId ? String(req.upiId).trim() : ""
    const hasUpi = !!upiId
    const upiLabel = hasUpi ? `UPI ID: ${upiId}` : "UPI ID not provided"

    const qrUrl = req?.qrCode?.url || ""
    const hasQr = !!qrUrl
    const qrLabel = hasQr ? "QR code uploaded" : "QR code not provided"

    return { hasBank, bankLabel, hasUpi, upiLabel, hasQr, qrLabel, qrUrl }
  }

  const payoutAvailability = getMethodAvailability(selectedRequest)

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Delivery Withdrawal</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            View and manage delivery boy withdrawal requests. Pending requests can be approved or rejected.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex gap-2 border-b border-slate-200">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Withdrawal Requests</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredRequests.length}
              </span>
            </div>
            <div className="relative flex-1 sm:flex-initial min-w-[200px] max-w-xs">
              <input
                type="text"
                placeholder="Search by delivery name, ID, phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading withdrawal requests…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Payout Method</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Delivery Boy</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Request Time</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No requests</p>
                          <p className="text-sm text-slate-500">
                            No {activeTab.toLowerCase()} withdrawal requests.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req, index) => (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(req.amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatMethod(req.paymentMethod)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{req.deliveryName || "N/A"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{req.deliveryIdString || "N/A"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatDate(req.requestedAt || req.createdAt)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(req.status)}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleView(req)}
                              className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                              title="View details"
                            >
                              <Eye className="w-4 h-4 text-amber-600" />
                            </button>
                            {req.status === "Pending" && (
                              <>
                                <button
                                  onClick={() => openApproveModal(req)}
                                  disabled={processingAction === req.id}
                                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Approve"
                                >
                                  {processingAction === req.id ? (
                                    <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(req)
                                    setShowRejectModal(true)
                                  }}
                                  disabled={processingAction === req.id}
                                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Reject"
                                >
                                  <XCircle className="w-4 h-4 text-red-600" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* View details dialog */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
              <DialogTitle>Withdrawal request details</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="px-6 pb-6 pt-4 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Amount</p>
                    <p className="text-base font-semibold text-slate-900 mt-1">{formatCurrency(selectedRequest.amount)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Status</p>
                    <div className="mt-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(selectedRequest.status)}`}>
                        {selectedRequest.status}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Request time</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{formatDate(selectedRequest.requestedAt || selectedRequest.createdAt)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Processed time</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedRequest.processedAt ? formatDate(selectedRequest.processedAt) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Delivery boy</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedRequest.deliveryName || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Delivery ID</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedRequest.deliveryIdString || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Phone</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedRequest.deliveryPhone || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Payout method</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{formatMethod(selectedRequest.paymentMethod)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Payout details</p>
                    {selectedRequest.paymentMethod === "admin_select" && (
                      <span className="text-xs text-slate-500">Admin selects method</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">Bank transfer</p>
                      {selectedRequest.bankDetails?.accountNumber ? (
                        <div className="text-xs text-slate-700 mt-2 space-y-1">
                          <p>{selectedRequest.bankDetails.accountHolderName || "N/A"}</p>
                          <p>
                            A/C ****{String(selectedRequest.bankDetails.accountNumber).slice(-4)} · {selectedRequest.bankDetails.bankName || "N/A"}
                          </p>
                          <p>IFSC: {selectedRequest.bankDetails.ifscCode || "N/A"}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-rose-600 mt-2">Not provided</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">UPI</p>
                      {selectedRequest.upiId ? (
                        <p className="text-xs text-slate-700 mt-2">{selectedRequest.upiId}</p>
                      ) : (
                        <p className="text-xs text-rose-600 mt-2">Not provided</p>
                      )}
                    </div>
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase">QR Code</p>
                      {selectedRequest.qrCode?.url ? (
                        <a
                          href={selectedRequest.qrCode.url}
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

                {selectedRequest.paymentScreenshot?.url && (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Payment screenshot</p>
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={selectedRequest.paymentScreenshot.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Download screenshot
                      </a>
                      <img
                        src={selectedRequest.paymentScreenshot.url}
                        alt="Payment screenshot"
                        className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                      />
                    </div>
                  </div>
                )}

                {selectedRequest.rejectionReason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold text-red-600 uppercase">Rejection reason</p>
                    <p className="text-sm font-medium text-red-700 mt-2">{selectedRequest.rejectionReason}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="px-6 pb-6">
              <button
                onClick={() => setIsViewOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Approve modal */}
        <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
          <DialogContent className="max-w-lg bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Approve withdrawal request</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select payout method <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {[
                    { value: "bank_transfer", label: "Bank transfer", available: payoutAvailability.hasBank, description: payoutAvailability.bankLabel },
                    { value: "upi", label: "UPI", available: payoutAvailability.hasUpi, description: payoutAvailability.upiLabel },
                    { value: "qr_code", label: "QR Code", available: payoutAvailability.hasQr, description: payoutAvailability.qrLabel }
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${opt.available ? "border-slate-200 hover:border-emerald-300" : "border-slate-100 opacity-60"}`}
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
                    No payout details available. Ask the delivery partner to update profile.
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment screenshot <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleApproveScreenshotChange}
                  className="w-full text-sm"
                />
                {approveUploading && (
                  <p className="text-xs text-slate-500 mt-2">Uploading…</p>
                )}
                {approveScreenshot?.url && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-20 w-20 rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                      <img
                        src={approveScreenshot.url}
                        alt="Payment screenshot"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <a
                      href={approveScreenshot.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Download screenshot
                    </a>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => {
                  setShowApproveModal(false)
                  setApproveScreenshot(null)
                  setApproveMethod("")
                  setSelectedRequest(null)
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={processingAction === selectedRequest?.id || approveUploading || !approveMethod}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingAction === selectedRequest?.id ? "Approving…" : "Approve"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Reject modal */}
        <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
          <DialogContent className="max-w-md bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Reject withdrawal request</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rejection reason (optional)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection…"
                  rows={4}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason("")
                  setSelectedRequest(null)
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedRequest && handleReject(selectedRequest.id)}
                disabled={processingAction === selectedRequest?.id}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingAction === selectedRequest?.id ? "Rejecting…" : "Reject"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Plus, Trash2 } from "lucide-react"
import { campaignAPI } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ITEMS_PER_PAGE = 10

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const statusBadge = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "active") return "bg-emerald-100 text-emerald-700"
  if (value === "scheduled") return "bg-indigo-100 text-indigo-700"
  if (value === "payment_pending") return "bg-amber-100 text-amber-700"
  if (value === "rejected") return "bg-red-100 text-red-700"
  if (value === "expired") return "bg-slate-200 text-slate-700"
  return "bg-blue-100 text-blue-700"
}

const mapRow = (ad) => ({
  id: ad.id,
  adsId: ad.adId,
  adsTitle: ad.title,
  restaurantName: ad.restaurant?.name || "N/A",
  restaurantEmail: ad.restaurant?.email || "-",
  adsType: ad.category || "-",
  duration: `${formatDate(ad.startDate)} - ${formatDate(ad.endDate || ad.validityDate)}`,
  status: String(ad.effectiveStatus || ad.status || "pending").toLowerCase(),
  priority: ad.priority ? String(ad.priority) : "",
})

export default function AdsList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [rows, setRows] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadAdvertisements = async () => {
    setLoading(true)
    try {
      const response = await campaignAPI.getAdminAdvertisements({ status: "all" })
      const list = response?.data?.data?.advertisements || []
      setRows(list.map(mapRow))
      setErrorMessage("")
    } catch (error) {
      setRows([])
      setErrorMessage(error?.response?.data?.message || "Failed to load advertisements")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdvertisements()
  }, [])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const query = searchQuery.toLowerCase().trim()
    return rows.filter((row) =>
      row.adsId?.toLowerCase().includes(query) ||
      row.adsTitle?.toLowerCase().includes(query) ||
      row.restaurantName?.toLowerCase().includes(query)
    )
  }, [rows, searchQuery])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE)),
    [filteredRows.length]
  )

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredRows.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredRows, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleDelete = async (id) => {
    setIsDeleting(true)
    try {
      await campaignAPI.deleteAdvertisementByAdmin(id)
      await loadAdvertisements()
      setIsDeleteDialogOpen(false)
      setDeleteTargetId("")
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to delete advertisement")
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePriorityChange = async (id, value) => {
    if (!value) return
    try {
      await campaignAPI.setAdvertisementPriority(id, Number(value))
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, priority: value } : row)))
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to update priority")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Ads List</h1>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">{filteredRows.length}</span>
          </div>
          <button onClick={() => navigate("/admin/advertisement/requests?tab=pending")} className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Ad Requests
          </button>
        </div>

        <div className="relative max-w-sm">
          <input
            type="text"
            placeholder="Search by ad ID, title, restaurant"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600 mb-4">{errorMessage}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">SI</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Ads ID</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Title</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Restaurant</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Type</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Duration</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Status</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Priority</th>
              <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center text-slate-500">Loading...</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center text-slate-500">No advertisements found</td></tr>
            ) : (
              paginatedRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="px-6 py-4 text-sm text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{row.adsId}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{row.adsTitle}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.restaurantName}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.adsType}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.duration}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-6 py-4">
                    <select value={row.priority} onChange={(e) => handlePriorityChange(row.id, e.target.value)} className="px-2 py-1 text-xs border border-slate-300 rounded-md">
                      <option value="">N/A</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => {
                        setDeleteTargetId(row.id)
                        setIsDeleteDialogOpen(true)
                      }}
                      className="p-2 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setIsDeleteDialogOpen(open)
            if (!open) setDeleteTargetId("")
          }
        }}
      >
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Delete Advertisement</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-600">Delete this advertisement?</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isDeleting) return
                  setIsDeleteDialogOpen(false)
                  setDeleteTargetId("")
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteTargetId) handleDelete(deleteTargetId)
                }}
                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                disabled={isDeleting || !deleteTargetId}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

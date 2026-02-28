import { useEffect, useState } from "react"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AnimatedPage from "@/module/user/components/AnimatedPage"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function ManageTablesPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [tables, setTables] = useState([])
    const [newTableNumber, setNewTableNumber] = useState("")
    const [newTableCapacity, setNewTableCapacity] = useState("")

    useEffect(() => {
        fetchTables()
    }, [])

    const fetchTables = async () => {
        try {
            const res = await restaurantAPI.getDiningTables()
            if (res.data?.success) {
                setTables(res.data.data.tables || [])
            }
        } catch (error) {
            console.error("Failed to fetch tables:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleAddTable = async () => {
        if (!newTableNumber || !newTableCapacity) {
            toast.error("Please enter both table number and capacity")
            return
        }

        try {
            const res = await restaurantAPI.addDiningTable({
                tableNumber: newTableNumber,
                capacity: newTableCapacity
            })
            if (res.data?.success) {
                toast.success("Table added successfully")
                setNewTableNumber("")
                setNewTableCapacity("")
                fetchTables()
            }
        } catch (error) {
            console.error("Failed to add table:", error)
            toast.error(error.response?.data?.message || "Failed to add table")
        }
    }

    const handleDeleteTable = async (tableId) => {
        try {
            const res = await restaurantAPI.deleteDiningTable(tableId)
            if (res.data?.success) {
                toast.success("Table deleted successfully")
                fetchTables()
            }
        } catch (error) {
            console.error("Failed to delete table:", error)
            toast.error("Failed to delete table")
        }
    }

    if (loading) {
        return (
            <AnimatedPage className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 border-4 border-[#ef4f5f] border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-500 font-medium">Loading...</p>
                </div>
            </AnimatedPage>
        )
    }

    return (
        <AnimatedPage className="min-h-screen bg-gray-50 pb-20">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
                <div className="max-w-6xl mx-auto w-full px-4 md:px-6 h-[72px] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/restaurant/dining-management")}
                            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5 text-gray-700" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Manage Tables</h1>
                            <p className="text-xs font-medium text-gray-500">Add available tables for users to book</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto w-full p-4 md:p-6">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-2 mb-6">
                        <div className="flex-1">
                            <Input
                                type="text"
                                placeholder="Table No (e.g. T-1)"
                                value={newTableNumber}
                                onChange={(e) => setNewTableNumber(e.target.value)}
                                className="h-11 rounded-xl border-gray-200 focus:border-[#ef4f5f] text-sm font-medium"
                            />
                        </div>
                        <div className="w-full sm:w-32">
                            <Input
                                type="number"
                                placeholder="Seats"
                                value={newTableCapacity}
                                onChange={(e) => setNewTableCapacity(e.target.value)}
                                className="h-11 rounded-xl border-gray-200 focus:border-[#ef4f5f] text-sm font-medium"
                                min="1"
                            />
                        </div>
                        <Button
                            onClick={handleAddTable}
                            className="h-11 sm:w-11 p-0 flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white rounded-xl"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {tables.length === 0 ? (
                            <div className="text-center py-6 text-sm text-gray-500 font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                No tables added yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {tables.map((table) => (
                                    <div key={table._id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase">Tbl</span>
                                                <span className="text-sm font-black text-gray-900 leading-none">{table.tableNumber}</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{table.capacity} Seats</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTable(table._id)}
                                            className="h-9 w-9 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </AnimatedPage>
    )
}

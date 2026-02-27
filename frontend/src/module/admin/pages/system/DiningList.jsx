import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Settings, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { adminAPI } from "@/lib/api";
import apiClient from "@/lib/api/axios";
import { getModuleToken } from "@/lib/utils/auth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function DiningList() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [restaurants, setRestaurants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter categories
    const [activeFilter, setActiveFilter] = useState('All');

    // Admin categories state
    const [adminCategories, setAdminCategories] = useState([]);

    // Modal state
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedRestaurant, setSelectedRestaurant] = useState(null);
    const [modalData, setModalData] = useState({ diningEnabled: false, guests: 6, cuisine: '' });

    useEffect(() => {
        fetchRestaurants();
        fetchAdminCategories();
    }, []);

    const getAuthConfig = (additionalConfig = {}) => {
        const adminToken = getModuleToken('admin')
        if (!adminToken) return additionalConfig
        return {
            ...additionalConfig,
            headers: {
                ...additionalConfig.headers,
                Authorization: `Bearer ${adminToken.trim()}`,
            }
        }
    }

    const fetchAdminCategories = async () => {
        try {
            const response = await apiClient.get('/admin/dining/categories', getAuthConfig());
            if (response.data.success) {
                setAdminCategories(response.data.data.categories);
            }
        } catch (err) {
            console.error("Error fetching admin dining categories:", err);
        }
    };

    const fetchRestaurants = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await adminAPI.getRestaurants({ limit: 10000, page: 1 });
            if (response.data && response.data.success && response.data.data) {
                const restaurantsData = response.data.data.restaurants || response.data.data || [];

                const mappedRestaurants = restaurantsData.map((restaurant) => ({
                    id: restaurant.restaurantId || restaurant._id || restaurant.id,
                    _id: restaurant._id,
                    name: restaurant.name || "N/A",
                    ownerName: restaurant.ownerName || "N/A",
                    ownerPhone: restaurant.ownerPhone || restaurant.phone || "N/A",
                    zone: restaurant.location?.area || restaurant.location?.city || restaurant.zone || "N/A",
                    status: restaurant.isActive !== false ? "Active" : "Inactive",
                    rating: restaurant.rating || restaurant.ratings?.average || 0,
                    logo: restaurant.profileImage?.url || restaurant.logo || "https://via.placeholder.com/40",
                    // Using default values for now since these fields might not be fully integrated into Restaurant model yet
                    diningEnabled: restaurant.diningEnabled || false, // Use database value or false
                    guests: restaurant.diningGuests || 15, // Use database value or 15
                    cuisine: restaurant.diningCategory || (Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0
                        ? restaurant.cuisines[0]
                        : (restaurant.cuisine || "N/A")),
                    cuisinesArray: Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0
                        ? restaurant.cuisines
                        : (restaurant.cuisine ? [restaurant.cuisine] : []),
                }));
                setRestaurants(mappedRestaurants);
            } else {
                setRestaurants([]);
            }
        } catch (err) {
            console.error("Error fetching dining restaurants:", err);
            setError("Failed to fetch restaurants");
            setRestaurants([]);
        } finally {
            setLoading(false);
        }
    };

    const formatRestaurantId = (id) => {
        if (!id) return "REST000000";
        if (id.startsWith('REST')) return id;
        return `REST-${String(id).slice(-6)}`;
    };

    const filteredRestaurants = useMemo(() => {
        let result = [...restaurants];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(restaurant =>
                restaurant.name.toLowerCase().includes(query) ||
                restaurant.ownerName.toLowerCase().includes(query) ||
                restaurant.ownerPhone.includes(query)
            );
        }

        if (activeFilter !== 'All') {
            result = result.filter(restaurant =>
                restaurant.cuisine.toLowerCase().includes(activeFilter.toLowerCase())
            );
        }

        return result;
    }, [restaurants, searchQuery, activeFilter]);

    // Handle dining toggle
    const handleToggleDining = async (id) => {
        const restaurant = restaurants.find(r => r._id === id);
        if (!restaurant) return;

        const newStatus = !restaurant.diningEnabled;
        const prevRestaurants = [...restaurants];

        // Optimistic update
        setRestaurants(prev => prev.map(r =>
            r._id === id ? { ...r, diningEnabled: newStatus } : r
        ));

        try {
            const res = await apiClient.put(`/admin/dining/restaurant/${id}/settings`, { diningEnabled: newStatus }, getAuthConfig());
            if (res.data.success) {
                toast.success("Dining status updated successfully");
            } else {
                throw new Error("Failed to update");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to update dining status");
            setRestaurants(prevRestaurants);
        }
    };

    const getCuisineCount = (cuisineKeyword) => {
        return restaurants.filter(r => r.cuisine.toLowerCase().includes(cuisineKeyword.toLowerCase())).length;
    };

    const openSettings = (restaurant) => {
        setSelectedRestaurant(restaurant);
        setModalData({
            diningEnabled: restaurant.diningEnabled,
            guests: restaurant.guests || 15,
            cuisine: restaurant.cuisine !== "N/A" ? restaurant.cuisine : ''
        });
        setIsSettingsModalOpen(true);
    };

    const handleSaveSettings = async () => {
        try {
            const res = await apiClient.put(`/admin/dining/restaurant/${selectedRestaurant._id}/settings`, {
                diningEnabled: modalData.diningEnabled,
                guests: modalData.guests,
                cuisine: modalData.cuisine || "N/A"
            }, getAuthConfig());

            if (res.data.success) {
                setRestaurants(prev => prev.map(r =>
                    r._id === selectedRestaurant._id
                        ? { ...r, diningEnabled: modalData.diningEnabled, guests: modalData.guests, cuisine: modalData.cuisine || "N/A" }
                        : r
                ));
                setIsSettingsModalOpen(false);
                toast.success("Dining settings updated successfully");
            } else {
                toast.error("Failed to update dining settings");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to update dining settings");
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <Card className="border-none shadow-sm rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold p-0 mb-1">Dining List</CardTitle>
                        <CardDescription>Manage restaurants available for dining.</CardDescription>
                    </div>
                    <Button onClick={() => navigate("/admin/restaurants/add")} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2">
                        <Plus size={16} />
                        Add Restaurant
                    </Button>
                </CardHeader>
            </Card>

            <Card className="border-none shadow-sm rounded-xl">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-5 border-b">
                    <CardTitle className="text-lg font-bold">Registered Dining Restaurants</CardTitle>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <Input
                            type="text"
                            placeholder="Search dining restaurants..."
                            className="pl-10 pr-4 py-2 w-full border-gray-200 rounded-lg outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Filters UI removed as requested */}

                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="ml-3 text-slate-600">Loading restaurants...</span>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center py-20">
                                <span className="text-red-500 font-medium">{error}</span>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left text-gray-800 font-medium whitespace-nowrap">
                                <thead className="bg-[#fcfdfd] text-[11px] uppercase text-gray-600 font-bold border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 rounded-tl-lg">RESTAURANT</th>
                                        <th className="px-6 py-4">OWNER</th>
                                        <th className="px-6 py-4">ZONE</th>
                                        <th className="px-6 py-4 text-center">DINING</th>
                                        <th className="px-6 py-4 text-center">GUESTS</th>
                                        <th className="px-6 py-4 text-center">RATING</th>
                                        <th className="px-6 py-4 text-center">STATUS</th>
                                        <th className="px-6 py-4 text-center">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRestaurants.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="text-center py-8 text-gray-500">
                                                No restaurants found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRestaurants.map((restaurant) => (
                                            <tr key={restaurant._id} className="bg-white border-b border-gray-50 hover:bg-gray-50/50">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3 w-48 truncate">
                                                        <div className="h-10 w-10 overflow-hidden rounded-full shadow-sm bg-gray-100 flex-shrink-0">
                                                            <img src={restaurant.logo} alt={restaurant.name} className="h-full w-full object-cover" onError={(e) => e.target.src = "https://via.placeholder.com/40"} />
                                                        </div>
                                                        <div className="truncate">
                                                            <p className="font-bold text-gray-900 truncate">{restaurant.name}</p>
                                                            <p className="text-xs text-gray-500 truncate">{formatRestaurantId(restaurant.id)}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-900 truncate w-32">{restaurant.ownerName}</p>
                                                    <p className="text-xs text-gray-500">{restaurant.ownerPhone}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="truncate w-24" title={restaurant.zone}>{restaurant.zone}</div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center">
                                                        <Switch
                                                            checked={restaurant.diningEnabled}
                                                            onCheckedChange={() => handleToggleDining(restaurant._id)}
                                                            className={restaurant.diningEnabled ? 'bg-blue-600 data-[state=checked]:bg-blue-600' : ''}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center">
                                                        <div className="border border-gray-200 rounded px-2 py-1 bg-gray-50 w-12 text-center text-gray-700">
                                                            {restaurant.guests}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center gap-0.5" title={`${restaurant.rating} Stars`}>
                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                            <svg key={star} className={`w-3.5 h-3.5 ${star <= Math.round(restaurant.rating) ? 'text-yellow-400' : 'text-gray-300'}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 22 20">
                                                                <path d="M20.924 7.625a1.523 1.523 0 0 0-1.238-1.044l-5.051-.734-2.259-4.577a1.534 1.534 0 0 0-2.752 0L7.365 5.847l-5.051.734A1.535 1.535 0 0 0 1.463 9.2l3.656 3.563-.863 5.031a1.532 1.532 0 0 0 2.226 1.616L11 17.033l4.518 2.375a1.534 1.534 0 0 0 2.226-1.617l-.863-5.03L20.537 9.2a1.523 1.523 0 0 0 .387-1.575Z" />
                                                            </svg>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center">
                                                        <Badge variant="outline" className={`border-none bg-transparent hover:bg-transparent font-semibold uppercase text-[10px] tracking-wide px-0 ${restaurant.diningEnabled ? 'text-green-600' : 'text-red-600'}`}>
                                                            {restaurant.diningEnabled ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center">
                                                        <button
                                                            onClick={() => openSettings(restaurant)}
                                                            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full bg-transparent">
                                                            <Settings size={18} className="stroke-[1.5px]" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dining Settings Modal */}
            {isSettingsModalOpen && selectedRestaurant && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <h2 className="text-[17px] font-bold text-gray-900">Edit Dining Settings</h2>
                            <button onClick={() => setIsSettingsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <label className="text-sm font-bold text-gray-900 block">Dining Status</label>
                                        <p className="text-[11px] text-gray-500 font-medium">Enable or disable dining for this restaurant</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-sm font-bold ${modalData.diningEnabled ? 'text-green-600' : 'text-red-600'}`}>
                                            {modalData.diningEnabled ? 'Active' : 'Inactive'}
                                        </span>
                                        <Switch
                                            checked={modalData.diningEnabled}
                                            onCheckedChange={(checked) => setModalData({ ...modalData, diningEnabled: checked })}
                                            className={modalData.diningEnabled ? 'bg-blue-600 data-[state=checked]:bg-blue-600' : ''}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-bold text-gray-900 block mb-2">Maximum Guests</label>
                                <Input
                                    type="number"
                                    value={modalData.guests}
                                    onChange={(e) => setModalData({ ...modalData, guests: e.target.value })}
                                    className="w-full border-gray-200"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-bold text-gray-900 block mb-2">Dining Category</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                    value={modalData.cuisine}
                                    onChange={(e) => setModalData({ ...modalData, cuisine: e.target.value })}
                                >
                                    <option value="" disabled>Select Category</option>
                                    {adminCategories.length > 0 ? (
                                        adminCategories.map((c) => (
                                            <option key={c._id} value={c.name}>{c.name}</option>
                                        ))
                                    ) : (
                                        selectedRestaurant.cuisinesArray && selectedRestaurant.cuisinesArray.length > 0 ? (
                                            selectedRestaurant.cuisinesArray.map((c, i) => (
                                                <option key={i} value={c}>{c}</option>
                                            ))
                                        ) : (
                                            <option value={selectedRestaurant.cuisine}>{selectedRestaurant.cuisine}</option>
                                        )
                                    )}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
                            <Button variant="ghost" className="font-semibold text-gray-600 hover:bg-transparent" onClick={() => setIsSettingsModalOpen(false)}>Cancel</Button>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md" onClick={handleSaveSettings}>Save Changes</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

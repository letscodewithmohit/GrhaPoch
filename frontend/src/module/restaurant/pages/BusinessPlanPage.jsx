import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { restaurantAPI } from "@/lib/api"

export default function BusinessPlanPage() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)

  const [loading, setLoading] = useState(true)
  const [planData, setPlanData] = useState({
    type: "commission",
    title: "Loading...",
    rate: "",
    description: "Please wait while we fetch your plan details.",
    features: []
  })

  const normalizeFeatures = (features) => {
    if (!Array.isArray(features)) return []
    return features
      .map((feature) => (typeof feature === "string" ? feature.trim() : ""))
      .filter(Boolean)
  }

  const getDefaultEffectiveFeatures = (plan) => {
    const durationMonths = Math.max(Number(plan?.durationMonths) || 1, 1)
    return [
      `Plan validity: ${durationMonths} month${durationMonths > 1 ? "s" : ""}`,
      "0% commission on orders while subscription is active",
      "Dining activation payment waiver eligibility after dining request approval"
    ]
  }

  // Fetch real plan data
  useEffect(() => {
    const fetchPlanDetails = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant = response?.data?.data?.restaurant || response?.data?.restaurant

        if (restaurant) {
          if (restaurant.businessModel === 'Subscription Base' && restaurant.subscription?.status === 'active') {
            const planName = restaurant.subscriptionPlanName || restaurant.subscription?.planName || "Subscription"
            let selectedPlan = null

            if (restaurant.subscription?.planId) {
              try {
                const plansRes = await restaurantAPI.getSubscriptionPlans()
                const plans = plansRes?.data?.data || []
                selectedPlan = plans.find((plan) => plan?._id?.toString() === restaurant.subscription.planId?.toString()) || null
              } catch (planError) {
                console.error("Error fetching subscription plans:", planError)
              }
            }

            const endDateText = restaurant.subscription?.endDate
              ? ` valid until ${new Date(restaurant.subscription.endDate).toLocaleDateString()}.`
              : "."

            setPlanData({
              type: "subscription",
              title: `${planName} Plan`,
              rate: "Active",
              description: selectedPlan?.description?.trim() || `You are currently on the ${planName} plan${endDateText}`,
              features: normalizeFeatures(selectedPlan?.effectiveFeatures?.length ? selectedPlan.effectiveFeatures : getDefaultEffectiveFeatures(selectedPlan))
            })
          } else {
            const commissionRate = restaurant.commissionRate || 10
            setPlanData({
              type: "commission",
              title: "Standard Commission Plan",
              rate: `${commissionRate}%`,
              description: `You are on the Pay-As-You-Go model. A standard ${commissionRate}% commission is applied to your orders.`,
              features: [`${commissionRate}% commission on each order`]
            })
          }
        }
      } catch (error) {
        console.error("Error fetching plan details:", error)
        setPlanData({
          type: "commission",
          title: "Commission Base Plan",
          rate: "10.0 %",
          description: "Restaurant will pay 10.0% commission to GrhaPoch from each order.",
          features: ["10.0% commission on each order"]
        })
      } finally {
        setLoading(false)
      }
    }

    fetchPlanDetails()
  }, [])

  // Lenis smooth scrolling for consistency
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#f6f6f6] pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button
          onClick={() => navigate('/restaurant/to-hub')}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 text-center -ml-8">
          My Business Plan
        </h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6 flex justify-center">
        <Card className="w-full max-w-md bg-white shadow-sm border-0">
          <CardContent className="pt-10 pb-16 px-6 text-center">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-[#008069] mb-4" />
                <p className="text-gray-500">Loading plan details...</p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-[#008069] mb-4">
                  {planData.title}
                </h2>
                <p className="text-4xl font-extrabold text-[#008069] mb-6">
                  {planData.rate}
                </p>
                <p className="text-sm leading-relaxed text-gray-600 max-w-xs mx-auto">
                  {planData.description}
                </p>
                {planData.features.length > 0 && (
                  <ul className="mt-5 space-y-2 text-left max-w-xs mx-auto">
                    {planData.features.map((feature, idx) => (
                      <li key={`${feature}-${idx}`} className="text-xs text-gray-600 leading-relaxed">
                        - {feature}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plans Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40 space-y-2">
        <Button
          variant="outline"
          className="w-full border-[#ff8100] text-[#ff8100] hover:bg-[#ff8100]/5 font-semibold py-2.5 rounded-xl text-sm"
          onClick={() => {
            navigate("/restaurant/subscription-plans")
          }}
        >
          View Plans
        </Button>
        <Button
          className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold py-3 rounded-xl text-base"
          onClick={() => {
            navigate("/restaurant/subscription-plans")
          }}
        >
          {planData.type === "subscription" ? "Renew / Change Plan" : "Upgrade to Subscription"}
        </Button>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <BottomNavbar onMenuClick={() => setShowMenu(true)} />

      {/* Menu Overlay */}
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}

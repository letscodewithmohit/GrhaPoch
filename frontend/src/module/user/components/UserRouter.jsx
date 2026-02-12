import { Routes, Route } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import UserLayout from "./UserLayout"

// Home & Discovery
import Home from "../pages/Home"
import Dining from "../pages/Dining"
import DiningRestaurants from "../pages/DiningRestaurants"
import DiningCategory from "../pages/DiningCategory"
import DiningExplore50 from "../pages/DiningExplore50"
import DiningExploreNear from "../pages/DiningExploreNear"
import Coffee from "../pages/Coffee"
import Under250 from "../pages/Under250"
import CategoryPage from "../pages/CategoryPage"
import Restaurants from "../pages/restaurants/Restaurants"
import RestaurantDetails from "../pages/restaurants/RestaurantDetails"
import SearchResults from "../pages/SearchResults"
import ProductDetail from "../pages/ProductDetail"

// Cart
import Cart from "../pages/cart/Cart"
import Checkout from "../pages/cart/Checkout"

// Orders
import Orders from "../pages/orders/Orders"
import OrderTracking from "../pages/orders/OrderTracking"
import OrderInvoice from "../pages/orders/OrderInvoice"
import UserOrderDetails from "../pages/orders/UserOrderDetails"

// Offers
import Offers from "../pages/Offers"

// Gourmet
import Gourmet from "../pages/Gourmet"

// Top 10
import Top10 from "../pages/Top10"

// Collections
import Collections from "../pages/Collections"
import CollectionDetail from "../pages/CollectionDetail"

// Gift Cards
import GiftCards from "../pages/GiftCards"
import GiftCardCheckout from "../pages/GiftCardCheckout"

// Profile
import Profile from "../pages/profile/Profile"
import EditProfile from "../pages/profile/EditProfile"
import Payments from "../pages/profile/Payments"
import AddPayment from "../pages/profile/AddPayment"
import EditPayment from "../pages/profile/EditPayment"
import Favorites from "../pages/profile/Favorites"
import Settings from "../pages/profile/Settings"
import Coupons from "../pages/profile/Coupons"
import RedeemGoldCoupon from "../pages/profile/RedeemGoldCoupon"
import About from "../pages/profile/About"
import Terms from "../pages/profile/Terms"
import Privacy from "../pages/profile/Privacy"
import Refund from "../pages/profile/Refund"
import Shipping from "../pages/profile/Shipping"
import Cancellation from "../pages/profile/Cancellation"
import SendFeedback from "../pages/profile/SendFeedback"
import ReportSafetyEmergency from "../pages/profile/ReportSafetyEmergency"
import Accessibility from "../pages/profile/Accessibility"
import Logout from "../pages/profile/Logout"

// Auth
import SignIn from "../pages/auth/SignIn"
import OTP from "../pages/auth/OTP"
import AuthCallback from "../pages/auth/AuthCallback"

// Help
import Help from "../pages/help/Help"
import OrderHelp from "../pages/help/OrderHelp"

// Notifications
import Notifications from "../pages/Notifications"

// Wallet
import Wallet from "../pages/Wallet"

// Complaints
import SubmitComplaint from "../pages/complaints/SubmitComplaint"

export default function UserRouter() {
  return (
    <Routes>
      <Route element={<UserLayout />}>
      {/* Home & Discovery */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Home />
          </ProtectedRoute>
        } 
      />
      <Route path="/dining" element={<Dining />} />
      <Route path="/dining/restaurants" element={<DiningRestaurants />} />
      <Route path="/dining/:category" element={<DiningCategory />} />
      <Route path="/dining/explore/upto50" element={<DiningExplore50 />} />
      <Route path="/dining/explore/near-rated" element={<DiningExploreNear />} />
      <Route path="/dining/coffee" element={<Coffee />} />
      <Route path="/under-250" element={<Under250 />} />
      <Route path="/category/:category" element={<CategoryPage />} />
      <Route path="/restaurants" element={<Restaurants />} />
      <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
      <Route path="/search" element={<SearchResults />} />
      <Route path="/product/:id" element={<ProductDetail />} />

      {/* Cart - Protected */}
      <Route 
        path="/cart" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Cart />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/cart/checkout" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Checkout />
          </ProtectedRoute>
        } 
      />

      {/* Orders - Protected */}
      <Route 
        path="/orders" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Orders />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/orders/:orderId" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <OrderTracking />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/orders/:orderId/invoice" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <OrderInvoice />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/orders/:orderId/details" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <UserOrderDetails />
          </ProtectedRoute>
        } 
      />

      {/* Offers */}
      <Route path="/offers" element={<Offers />} />

      {/* Gourmet */}
      <Route path="/gourmet" element={<Gourmet />} />

      {/* Top 10 */}
      <Route path="/top-10" element={<Top10 />} />

      {/* Collections */}
      <Route path="/collections" element={<Collections />} />
      <Route 
        path="/collections/:id" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <CollectionDetail />
          </ProtectedRoute>
        } 
      />

      {/* Gift Cards */}
      <Route path="/gift-card" element={<GiftCards />} />
      <Route 
        path="/gift-card/checkout" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <GiftCardCheckout />
          </ProtectedRoute>
        } 
      />

      {/* Profile - Protected */}
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Profile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/edit" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <EditProfile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/payments" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Payments />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/payments/new" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <AddPayment />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/payments/:id/edit" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <EditPayment />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/favorites" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Favorites />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/settings" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Settings />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/coupons" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Coupons />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/redeem-gold-coupon" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <RedeemGoldCoupon />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/about" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <About />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/terms" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Terms />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/privacy" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Privacy />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/refund" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Refund />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/shipping" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Shipping />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/cancellation" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Cancellation />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/send-feedback" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <SendFeedback />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/report-safety-emergency" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <ReportSafetyEmergency />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/accessibility" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Accessibility />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/logout" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Logout />
          </ProtectedRoute>
        } 
      />

      {/* Auth */}
      <Route path="/auth/sign-in" element={<AuthRedirect module="user"><SignIn /></AuthRedirect>} />
      <Route path="/auth/otp" element={<AuthRedirect module="user"><OTP /></AuthRedirect>} />
      <Route path="/auth/callback" element={<AuthRedirect module="user"><AuthCallback /></AuthRedirect>} />

      {/* Help */}
      <Route path="/help" element={<Help />} />
      <Route path="/help/orders/:orderId" element={<OrderHelp />} />

      {/* Notifications - Protected */}
      <Route 
        path="/notifications" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Notifications />
          </ProtectedRoute>
        } 
      />

      {/* Wallet - Protected */}
      <Route 
        path="/wallet" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <Wallet />
          </ProtectedRoute>
        } 
      />

      {/* Complaints - Protected */}
      <Route 
        path="/complaints/submit/:orderId" 
        element={
          <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
            <SubmitComplaint />
          </ProtectedRoute>
        } 
      />
      </Route>
    </Routes>
  )
}


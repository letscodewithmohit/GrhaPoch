/**
 * Migration script: Move from modules/shared to flat MVC structure
 * Run with: node migrate_to_flat.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = __dirname;

// Map old paths to new paths (relative to backend)
const MODEL_MOVES = [
  ['modules/auth/models/User.js', 'models/User.js'],
  ['modules/auth/models/Otp.js', 'models/Otp.js'],
  ['modules/user/models/UserWallet.js', 'models/UserWallet.js'],
  ['modules/user/models/Donation.js', 'models/Donation.js'],
  ['modules/restaurant/models/Restaurant.js', 'models/Restaurant.js'],
  ['modules/restaurant/models/Menu.js', 'models/Menu.js'],
  ['modules/restaurant/models/RestaurantWallet.js', 'models/RestaurantWallet.js'],
  ['modules/restaurant/models/WithdrawalRequest.js', 'models/WithdrawalRequest.js'],
  ['modules/restaurant/models/RestaurantNotification.js', 'models/RestaurantNotification.js'],
  ['modules/restaurant/models/RestaurantCategory.js', 'models/RestaurantCategory.js'],
  ['modules/restaurant/models/OutletTimings.js', 'models/OutletTimings.js'],
  ['modules/restaurant/models/Offer.js', 'models/Offer.js'],
  ['modules/restaurant/models/MenuItemSchedule.js', 'models/MenuItemSchedule.js'],
  ['modules/restaurant/models/Inventory.js', 'models/Inventory.js'],
  ['modules/restaurant/models/StaffManagement.js', 'models/StaffManagement.js'],
  ['modules/payment/models/Payment.js', 'models/Payment.js'],
  ['modules/order/models/Order.js', 'models/Order.js'],
  ['modules/order/models/OrderSettlement.js', 'models/OrderSettlement.js'],
  ['modules/order/models/OrderEvent.js', 'models/OrderEvent.js'],
  ['modules/order/models/ETALog.js', 'models/ETALog.js'],
  ['modules/delivery/models/Delivery.js', 'models/Delivery.js'],
  ['modules/delivery/models/DeliveryWallet.js', 'models/DeliveryWallet.js'],
  ['modules/delivery/models/DeliveryWithdrawalRequest.js', 'models/DeliveryWithdrawalRequest.js'],
  ['modules/campaign/models/Advertisement.js', 'models/Advertisement.js'],
  ['modules/campaign/models/AdvertisementSetting.js', 'models/AdvertisementSetting.js'],
  ['modules/heroBanner/models/HeroBanner.js', 'models/HeroBanner.js'],
  ['modules/heroBanner/models/DiningBanner.js', 'models/DiningBanner.js'],
  ['modules/heroBanner/models/GourmetRestaurant.js', 'models/GourmetRestaurant.js'],
  ['modules/heroBanner/models/LandingPageCategory.js', 'models/LandingPageCategory.js'],
  ['modules/heroBanner/models/LandingPageExploreMore.js', 'models/LandingPageExploreMore.js'],
  ['modules/heroBanner/models/LandingPageSettings.js', 'models/LandingPageSettings.js'],
  ['modules/heroBanner/models/Top10Restaurant.js', 'models/Top10Restaurant.js'],
  ['modules/heroBanner/models/Under250Banner.js', 'models/Under250Banner.js'],
  ['modules/dining/models/DiningRestaurant.js', 'models/DiningRestaurant.js'],
  ['modules/dining/models/DiningCategory.js', 'models/DiningCategory.js'],
  ['modules/dining/models/DiningLimelight.js', 'models/DiningLimelight.js'],
  ['modules/dining/models/DiningBankOffer.js', 'models/DiningBankOffer.js'],
  ['modules/dining/models/DiningMustTry.js', 'models/DiningMustTry.js'],
  ['modules/dining/models/DiningTable.js', 'models/DiningTable.js'],
  ['modules/dining/models/DiningStory.js', 'models/DiningStory.js'],
  ['modules/dining/models/DiningOfferBanner.js', 'models/DiningOfferBanner.js'],
  ['modules/dining/models/DiningBooking.js', 'models/DiningBooking.js'],
  ['modules/admin/models/Admin.js', 'models/Admin.js'],
  ['modules/admin/models/Zone.js', 'models/Zone.js'],
  ['modules/admin/models/About.js', 'models/About.js'],
  ['modules/admin/models/AuditLog.js', 'models/AuditLog.js'],
  ['modules/admin/models/BusinessSettings.js', 'models/BusinessSettings.js'],
  ['modules/admin/models/CancellationPolicy.js', 'models/CancellationPolicy.js'],
  ['modules/admin/models/DeliveryBoyCommission.js', 'models/DeliveryBoyCommission.js'],
  ['modules/admin/models/DeliveryEmergencyHelp.js', 'models/DeliveryEmergencyHelp.js'],
  ['modules/admin/models/DeliverySupportTicket.js', 'models/DeliverySupportTicket.js'],
  ['modules/admin/models/EarningAddon.js', 'models/EarningAddon.js'],
  ['modules/admin/models/EarningAddonHistory.js', 'models/EarningAddonHistory.js'],
  ['modules/admin/models/EnvironmentVariable.js', 'models/EnvironmentVariable.js'],
  ['modules/admin/models/FeeSettings.js', 'models/FeeSettings.js'],
  ['modules/admin/models/Feedback.js', 'models/Feedback.js'],
  ['modules/admin/models/FeedbackExperience.js', 'models/FeedbackExperience.js'],
  ['modules/admin/models/PrivacyPolicy.js', 'models/PrivacyPolicy.js'],
  ['modules/admin/models/RefundPolicy.js', 'models/RefundPolicy.js'],
  ['modules/admin/models/RestaurantComplaint.js', 'models/RestaurantComplaint.js'],
  ['modules/admin/models/RestaurantCommission.js', 'models/RestaurantCommission.js'],
  ['modules/admin/models/ShippingPolicy.js', 'models/ShippingPolicy.js'],
  ['modules/admin/models/SafetyEmergency.js', 'models/SafetyEmergency.js'],
  ['modules/admin/models/SubscriptionPlan.js', 'models/SubscriptionPlan.js'],
  ['modules/admin/models/SubscriptionPayment.js', 'models/SubscriptionPayment.js'],
  ['modules/admin/models/TermsAndCondition.js', 'models/TermsAndCondition.js'],
  ['modules/admin/models/AdminWallet.js', 'models/AdminWallet.js'],
  ['modules/admin/models/AdminCommission.js', 'models/AdminCommission.js'],
  ['modules/admin/models/AdminCategoryManagement.js', 'models/AdminCategoryManagement.js'],
  ['modules/userAdvertisements/userAdvertisement.model.js', 'models/UserAdvertisement.js'],
];

// Import path replacements for models (from model file perspective, in models/)
function updateModelImports(content) {
  return content
    .replace(/from '\.\.\/\.\.\/\.\.\/shared\/utils\//g, "from '../utils/")
    .replace(/from '\.\.\/\.\.\/shared\/utils\//g, "from '../utils/")
    .replace(/from '\.\.\/\.\.\/\.\.\/\.\.\/shared\/utils\//g, "from '../utils/")
    .replace(/from '\.\.\/\.\.\/admin\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/admin\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/restaurant\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/restaurant\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/auth\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/auth\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/user\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/user\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/order\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/order\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/payment\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/payment\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/delivery\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/delivery\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/campaign\/models\//g, "from './")
    .replace(/from '\.\.\/\.\.\/\.\.\/campaign\/models\//g, "from './")
    .replace(/from '\.\.\/models\//g, "from './");
}

function copyAndTransform(src, dest, transform) {
  const srcPath = path.join(backend, src);
  const destPath = path.join(backend, dest);
  if (!fs.existsSync(srcPath)) {
    console.warn('Skip (not found):', src);
    return;
  }
  let content = fs.readFileSync(srcPath, 'utf8');
  if (transform) content = transform(content);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
  console.log('OK:', dest);
}

console.log('Migrating models...');
for (const [src, dest] of MODEL_MOVES) {
  copyAndTransform(src, dest, updateModelImports);
}
console.log('Models done.');

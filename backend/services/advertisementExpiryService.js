import Advertisement from '../models/Advertisement.js';

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export async function processAdvertisementExpiries() {
  try {
    const today = startOfToday();

    const result = await Advertisement.updateMany(
      {
        adType: 'restaurant_banner',
        status: { $in: ['pending', 'payment_pending', 'approved', 'paused', 'active'] },
        isDeleted: false,
        endDate: { $lt: today }
      },
      {
        $set: {
          status: 'expired'
        }
      }
    );

    const expired = result.modifiedCount || 0;

    return {
      processed: result.matchedCount || 0,
      expired,
      message: `Expired ${expired} advertisement(s).`
    };
  } catch (error) {
    console.error('[Advertisement Expiry Cron] Critical error:', error);
    throw error;
  }
}

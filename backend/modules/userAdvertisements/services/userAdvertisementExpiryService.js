import UserAdvertisement from '../userAdvertisement.model.js';

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export async function processUserAdvertisementExpiries() {
  try {
    const today = startOfToday();

    const result = await UserAdvertisement.updateMany(
      {
        isDeleted: false,
        status: 'active',
        isActive: true,
        endDate: { $lt: today }
      },
      {
        $set: {
          status: 'expired',
          isActive: false
        }
      }
    );

    const expired = result.modifiedCount || 0;

    return {
      processed: result.matchedCount || 0,
      expired,
      message: `Expired ${expired} user advertisement(s).`
    };
  } catch (error) {
    console.error('[User Advertisement Expiry Cron] Critical error:', error);
    throw error;
  }
}

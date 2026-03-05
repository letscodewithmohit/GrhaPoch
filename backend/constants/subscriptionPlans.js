export const FIXED_SUBSCRIPTION_PLANS = [
  {
    name: 'Basic',
    key: 'basic',
    order: 1,
    razorpayPlanId: 'plan_SNWKBmWBVuFCk8'
  },
  {
    name: 'Growth',
    key: 'growth',
    order: 2,
    razorpayPlanId: 'plan_SNWNrk3t6xGoSW'
  },
  {
    name: 'Premium',
    key: 'premium',
    order: 3,
    razorpayPlanId: 'plan_SNWOkUVwMyVDmL'
  }
];

export const FIXED_SUBSCRIPTION_PLAN_NAMES = FIXED_SUBSCRIPTION_PLANS.map((plan) => plan.name);
export const FIXED_SUBSCRIPTION_PLAN_KEYS = FIXED_SUBSCRIPTION_PLANS.map((plan) => plan.key);

const planMapByName = new Map(
  FIXED_SUBSCRIPTION_PLANS.map((plan) => [String(plan.name).toLowerCase(), plan])
);
const planMapByKey = new Map(
  FIXED_SUBSCRIPTION_PLANS.map((plan) => [String(plan.key).toLowerCase(), plan])
);

export const getFixedPlanByName = (name) => {
  if (!name) return null;
  return planMapByName.get(String(name).toLowerCase()) || null;
};

export const getFixedPlanByKey = (key) => {
  if (!key) return null;
  return planMapByKey.get(String(key).toLowerCase()) || null;
};

export const getFixedPlanByDoc = (planDoc) => {
  if (!planDoc) return null;
  return getFixedPlanByKey(planDoc.planKey) || getFixedPlanByName(planDoc.name);
};

export const isFixedPlanName = (name) => !!getFixedPlanByName(name);

export const sortPlansByFixedOrder = (plans = []) => {
  return [...plans].sort((a, b) => {
    const aOrder = getFixedPlanByName(a?.name)?.order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = getFixedPlanByName(b?.name)?.order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
};

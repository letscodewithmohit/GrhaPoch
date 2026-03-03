import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// MongoDB URI from your .env file
const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

// Admin credentials
const ADMIN_EMAIL = 'Grhapoch@gmail.com';
const ADMIN_PASSWORD = 'grhapoch123';

// Admin Schema (inline for script)
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  phone: { type: String, sparse: true, trim: true },
  phoneVerified: { type: Boolean, default: false },
  profileImage: { type: String },
  permissions: {
    type: [String],
    enum: [
    'dashboard_view',
    'admin_manage',
    'restaurant_manage',
    'delivery_manage',
    'order_manage',
    'user_manage',
    'report_view',
    'settings_manage',
    'payment_manage',
    'campaign_manage'],

    default: ['dashboard_view']
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin'
  },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  loginCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

const Admin = mongoose.model('Admin', adminSchema);

async function createAdmin() {
  try {

    await mongoose.connect(MONGO_URI);


    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existingAdmin) {





      // Update password

      existingAdmin.password = ADMIN_PASSWORD;
      await existingAdmin.save();

    } else {
      // Create new admin

      const admin = new Admin({
        name: 'Grha Poch Admin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'super_admin',
        permissions: [
        'dashboard_view',
        'admin_manage',
        'restaurant_manage',
        'delivery_manage',
        'order_manage',
        'user_manage',
        'report_view',
        'settings_manage',
        'payment_manage',
        'campaign_manage'],

        isActive: true
      });

      await admin.save();

    }








    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createAdmin();
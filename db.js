const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "parking123",
  database: process.env.DB_NAME || "smart_parking",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Disable Windows SSPI/GSSAPI authentication - force password auth
  authPlugins: {
    mysql_native_password: () => require('mysql2/lib/auth_plugins/mysql_native_password')
  }
});

// Test connection and provide helpful error message
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
    if (err.message.includes('SSPI') || err.message.includes('auth_gssapi') || err.message.includes('SEC_E_INVALID_TOKEN')) {
      console.error('\n⚠️  Windows SSPI/GSSAPI authentication error detected!');
      console.error('📝 Fix: Run this in your MySQL/MariaDB command line:');
      console.error("   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'parking123';");
      console.error('   FLUSH PRIVILEGES;');
      console.error('\n💡 Or re-run the sql\\smart_parking.sql file (it now includes the fix at the top)\n');
    }
  });

module.exports = pool;

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();
(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros');
  const db = mongoose.connection.db!;
  console.log('users:', await db.collection('users').countDocuments());
  console.log('bestiae:', await db.collection('bestiae').countDocuments());
  const us = await db
    .collection('users')
    .find({}, { projection: { email: 1, role: 1 } })
    .limit(20)
    .toArray();
  us.forEach((u) => console.log('  ', u.email, 'role=', u.role));
  await mongoose.disconnect();
})();

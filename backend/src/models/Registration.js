import { Schema, model } from 'mongoose';

const schema = new Schema({
  phone:      { type: String, required: true, unique: true, trim: true },
  created_at: { type: Date, default: Date.now }
});

schema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default model('Registration', schema);

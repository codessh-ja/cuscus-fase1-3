import { Schema, model } from 'mongoose';

const schema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true }
});

export default model('Config', schema);

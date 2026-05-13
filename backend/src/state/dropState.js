import Config from '../models/Config.js';

const KEY = 'drop_state';

export async function getDropState() {
  const doc = await Config.findOne({ key: KEY });
  return doc ? doc.value : { stage: 'pre_drop' };
}

export async function setDropState(stage) {
  const state = { stage };
  await Config.findOneAndUpdate(
    { key: KEY },
    { value: state },
    { upsert: true }
  );
  return state;
}

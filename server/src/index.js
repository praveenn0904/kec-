import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { Store } from './store.js';
import { validatePassword } from './validate.js';

const PORT = process.env.PORT || 4000;
const store = new Store();

// The first administrator comes from the environment. Nothing else is created automatically.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  const weak = validatePassword(ADMIN_PASSWORD);
  if (weak) {
    console.error(`ADMIN_PASSWORD is not accepted: ${weak}. The administrator was not created.`);
  } else if (store.ensureAdmin(ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10))) {
    console.log(`Administrator account created for ${ADMIN_EMAIL}`);
  }
}

createApp({ store }).listen(PORT, () => {
  console.log(`College Contact Manager API running on http://localhost:${PORT}`);
});

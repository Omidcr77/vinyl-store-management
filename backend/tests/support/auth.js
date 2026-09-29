import request from "supertest";
import User from "../../models/User.js";
import { hashPassword } from "../../services/authService.js";
const sessions = new WeakMap();
export async function signInTestAdmin(app) {
  await User.create({
    username: "testadmin",
    name: "Test Admin",
    role: "admin",
    mustChangePassword: false,
    passwordHash: await hashPassword("Test-password-123"),
  });
  const response = await request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "store-app")
    .send({ username: "testadmin", password: "Test-password-123" })
    .expect(200);
  sessions.set(app, {
    cookie: response.headers["set-cookie"][0].split(";")[0],
    csrf: response.body.data.csrf,
  });
}
export default function authenticatedRequest(app) {
  const session = sessions.get(app);
  return Object.fromEntries(
    ["get", "post", "put", "patch", "delete", "head"].map((method) => [
      method,
      (path) =>
        request(app)
          [method](path)
          .set("Cookie", session.cookie)
          .set("X-CSRF-Token", session.csrf),
    ]),
  );
}

// stuff every view needs. main.js fills it in after each load
export const app = {
  S: null,       // last state from the server
  users: [],     // who can sign in
  who: null,     // signed in user id
  tab: null,
};

// views call reload() after they change something. main.js plugs in the real loader
let loader = async () => {};
export const setLoader = (fn) => { loader = fn; };
export const reload = () => loader();

export const isManager = () => app.S.user.role === "manager";
export const roleName = (id) => (app.S.roles.find((r) => r.id === id) || {}).name || id;
export const empName = (id) => (app.S.employees.find((e) => e.id === id) || {}).name || "";
export const me = () => app.S.employees.find((e) => e.id === app.S.employeeId);

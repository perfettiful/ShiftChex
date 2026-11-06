// stuff every view needs. main.js fills it in after each load
export const app = {
  S: null,         // last state from the server
  R: null,         // the coverage report, only loaded on the report tab
  user: null,      // who's signed in, from /api/me or the login
  tab: null,
  periodId: null,  // the week the manager is looking at
  week: null,      // a ?week= start date from the address bar, until it's been picked
};

// views call reload() after they change something. main.js plugs in the real loader
let loader = async () => {};
export const setLoader = (fn) => { loader = fn; };
export const reload = () => loader();

export const isManager = () => app.S.user.role === "manager";
export const roleName = (id) => (app.S.roles.find((r) => r.id === id) || {}).name || id;
export const empName = (id) => (app.S.employees.find((e) => e.id === id) || {}).name || "";
// the signed in employee, with their certs and availability
export const me = () => app.S.me;

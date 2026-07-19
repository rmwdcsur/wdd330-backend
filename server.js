const data = require("./db.json");
// import jsonServer from "json-server";
const jsonServer = require("json-server");

// import  jwt from "jsonwebtoken";
const jwt = require("jsonwebtoken");

const bodyParser = require("body-parser");
const server = jsonServer.create();
const router = jsonServer.router("db.json");

server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());
server.use(jsonServer.defaults());

const SECRET_KEY = "123456789";

// token timeout is set here
const expiresIn = "5m";

// Create a token from a payload
function createToken(payload) {
  return jwt.sign(payload, SECRET_KEY, { expiresIn });
}

// Verify the token
function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY, (err, decode) => {
    if (err) {
      throw Error(err);
    } else {
      return decode;
    }
  });
}

// Check if the user exists in database
function isAuthenticated({ email, password }) {
  return (
    //userdb.users.findIndex(user => user.username === username && user.password === password) !== -1
    router.db
      .get("users")
      .findIndex((user) => user.email === email && user.password === password)
      .value() !== -1
  );
}

// convert fetch response to json if it is OK
function convertToJson(res) {
  if (res.ok) {
    return res.json();
  } else {
    console.log(res.statusText);
    throw new Error(res.statusText);
  }
}

// Helper function to get the authenticated user from the request
function getAuthenticatedUser(req) {
  return router.db.get("users").find({ email: req.claims.email }).value();
}

// Middleware de autenticacion
server.use((req, res, next) => {
  const auth = req.headers.authorization;

  if (auth && auth.startsWith("Bearer ")) {
    try {
      const token = auth.split(" ")[1];
      req.claims = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        message: err.message,
      });
    }
  }

  next();
});

server.post("/login", (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);

  if (isAuthenticated({ email, password }) === false) {
    const status = 401;
    const message = "Incorrect username or password";
    res.status(status).json({ status, message });
    return;
  }
  const accessToken = createToken({ email });
  res.status(200).json({ accessToken });
});

server.post("/users", (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);
  if (email && password) {
    res.status(200).json({ message: `User created: ${email}` });
  } else {
    res
      .status(400)
      .json({ message: `Create failed: Email and password required` });
  }
});

// Admin function to get leave records for a specific employee by their employeeId
server.get("/leave/:employeeId", async (req, res) => {
  const employeeId = req.params.employeeId;
  const leaveRecords = await router.db.get("leave").value();
  const employeeLeave = leaveRecords.filter(
    (record) => record.employeeId == employeeId,
  );
  console.log(employeeLeave);
  if (employeeLeave.length > 0) {
    res.status(200).json({ Result: employeeLeave });
  } else {
    res.status(400).json({ Result: "No leave records found" });
  }
});

// Employee function to get leave records for the logged-in user
server.get("/leave-days", (req, res) => {
  const user = router.db.get("users").find({ email: req.claims.email }).value();

  const leave = router.db
    .get("leave")
    .filter({ employeeId: user.employeeId })
    .value();

  res.json(leave);
});

server.get("/me", (req, res) => {
  if (!req.claims) {
    return res.status(401).json({ message: "No token" });
  }

  const user = router.db.get("users").find({ email: req.claims.email }).value();

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json(user);
});

// leave request endpoint
server.post("/new-leave-request", (req, res) => {
  const user = router.db.get("users").find({ email: req.claims.email }).value();
  const leaveRequest = req.body;
  
  console.log(req.body);
  
  if (!leaveRequest.startDate || !leaveRequest.endDate) {
    return res
      .status(400)
      .json({ message: "Start date and end date are required" });
  }

  // Calculate the number of days requested
  const startDate = new Date(leaveRequest.startDate);
  const endDate = new Date(leaveRequest.endDate);
  const timeDiff = endDate - startDate;
  const daysRequested = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include the start date
  const now = new Date();

  if (daysRequested > user.daysLeft) {
    return res.status(400).json({ message: "Not enough leave days left" });
  }

  // Create a new leave record
  const newLeaveRecord = {
    id: router.db.get("leaveRequests").value().length + 1,
    employeeId: user.employeeId,
    startDate: leaveRequest.startDate,
    endDate: leaveRequest.endDate,
    days: daysRequested,
	description: leaveRequest.description,
	createdAt: now.toISOString().split("T")[0],
	status: "pending",
	reviewDate: null,
  };

  router.db.get("leaveRequests").push(newLeaveRecord).write();

  res.status(200).json({ message: "Leave request submitted successfully" });
});

// my leave requests endpoint
server.get("/my-leave-requests", (req, res) => {
  const user = router.db.get("users").find({ email: req.claims.email }).value();

  const leaveRequests = router.db
    .get("leaveRequests")
    .filter({ employeeId: user.employeeId })
    .value();

  res.json(leaveRequests);
});

// Admin function to get all leave requests
server.get("/leave-requests", (req, res) => {
  const leaveRequests = router.db.get("leaveRequests").value();
  res.json(leaveRequests);
});

// Admin function to approve a leave request
server.post("/approve-leave-request/:id", (req, res) => {
  const requestId = parseInt(req.params.id);
  const leaveRequest = router.db
    .get("leaveRequests")
    .find({ id: requestId })
    .value();

  if (!leaveRequest) {
    return res.status(404).json({ message: "Leave request not found" });
  }

  // Update the leave request status
  router.db
    .get("leaveRequests")
    .find({ id: requestId })
    .assign({ status: "approved" })
    .write();

  res.json({ message: "Leave request approved" });
});

server.use(router);

server.listen(3000, () => {
  console.log("Run Auth API Server on port 3000");
});

module.exports = server;

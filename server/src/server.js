

// const http = require("http");
// const { Server } = require("socket.io");
// const app = require("./app");

// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "*",
//   },
// });

// /* =======================
//    In-memory poll state
// ======================= */
// let activeQuestion = null;
// let questionTimer = null;

// /* =======================
//    Helpers
// ======================= */

// // Calculate poll results
// function calculateResults() {
//   const counts = {};
//   Object.values(activeQuestion.answers).forEach((idx) => {
//     counts[idx] = (counts[idx] || 0) + 1;
//   });

//   const total = Object.keys(activeQuestion.answers).length;

//   return activeQuestion.options.map((_, i) => ({
//     optionIndex: i,
//     count: counts[i] || 0,
//     percentage: total
//       ? Math.round(((counts[i] || 0) / total) * 100)
//       : 0,
//   }));
// }

// // Broadcast current students list
// function broadcastParticipants() {
//   const participants = [...io.sockets.sockets.values()]
//     .filter((s) => s.data.role === "student")
//     .map((s) => ({
//       socketId: s.id,
//       name: s.data.name,
//     }));

//   io.emit("PARTICIPANTS_UPDATE", participants);
// }

// /* =======================
//    Socket logic
// ======================= */
// io.on("connection", (socket) => {
//   console.log("Client connected:", socket.id);

//   /* ---------- CHAT ---------- */
//   socket.on("SEND_MESSAGE", (msg) => {
//     io.emit("RECEIVE_MESSAGE", {
//       user: socket.data.name || "User",
//       message: msg,
//       socketId: socket.id,
//     });
//   });

//   /* ---------- JOIN EVENTS ---------- */
//   socket.on("JOIN_STUDENT", ({ name }) => {
//     socket.data.name = name;
//     socket.data.role = "student";

//     console.log("Student joined:", name);
//     broadcastParticipants();
//   });

//   socket.on("JOIN_TEACHER", () => {
//     socket.data.name = "Teacher";
//     socket.data.role = "teacher";

//     console.log("Teacher joined");
//   });

//   /* ---------- KICK STUDENT ---------- */
//   socket.on("KICK_STUDENT", (studentSocketId) => {
//     const studentSocket = io.sockets.sockets.get(studentSocketId);

//     if (studentSocket) {
//       studentSocket.emit("KICKED_OUT");
//       studentSocket.disconnect(true);
//     }

//     broadcastParticipants();
//   });

//   /* ---------- ASK QUESTION ---------- */
//   socket.on("ASK_QUESTION", ({ question, options, duration }) => {
//     if (activeQuestion) return;

//     activeQuestion = {
//       question,
//       options,
//       duration,
//       answers: {},
//     };

//     io.emit("NEW_QUESTION", activeQuestion);

//     questionTimer = setTimeout(() => {
//       if (!activeQuestion) return;

//       io.emit("SHOW_RESULTS", calculateResults());

//       activeQuestion = null;
//       questionTimer = null;
//     }, duration * 1000);
//   });

//   /* ---------- SUBMIT ANSWER ---------- */
//   socket.on("SUBMIT_ANSWER", ({ optionIndex }) => {
//     if (!activeQuestion) return;
//     if (activeQuestion.answers[socket.id] !== undefined) return;

//     activeQuestion.answers[socket.id] = optionIndex;

//     const studentsCount = [...io.sockets.sockets.values()].filter(
//       (s) => s.data.role === "student"
//     ).length;

//     if (
//       Object.keys(activeQuestion.answers).length === studentsCount &&
//       studentsCount > 0
//     ) {
//       if (questionTimer) clearTimeout(questionTimer);

//       io.emit("SHOW_RESULTS", calculateResults());

//       activeQuestion = null;
//       questionTimer = null;
//     }
//   });

//   /* ---------- DISCONNECT ---------- */
//   socket.on("disconnect", () => {
//     console.log("Client disconnected:", socket.id);
//     broadcastParticipants();
//   });
// });

// /* =======================
//    Start server
// ======================= */
// const PORT = 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

/* =======================
   In-memory poll state
======================= */
let activeQuestion = null;
let questionTimer = null;
let pollHistory = [];
let pollId = 1;

/* =======================
   Helpers
======================= */
function calculateResults() {
  const counts = {};
  Object.values(activeQuestion.answers).forEach((idx) => {
    counts[idx] = (counts[idx] || 0) + 1;
  });

  const total = Object.keys(activeQuestion.answers).length;

  return activeQuestion.options.map((_, i) => ({
    optionIndex: i,
    count: counts[i] || 0,
    percentage: total
      ? Math.round(((counts[i] || 0) / total) * 100)
      : 0,
  }));
}

/* 🔧 REQUIRED: broadcastParticipants (used below) */
function broadcastParticipants() {
  const participants = [...io.sockets.sockets.values()]
    .filter((s) => s.data.role === "student")
    .map((s) => ({
      socketId: s.id,
      name: s.data.name,
    }));

  io.emit("PARTICIPANTS_UPDATE", participants);
}

/* =======================
   Socket logic
======================= */
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  /* CHAT */
  socket.on("SEND_MESSAGE", (msg) => {
    io.emit("RECEIVE_MESSAGE", {
      user: socket.data.name || "User",
      message: msg,
      socketId: socket.id,
    });
  });

  /* JOIN */
  socket.on("JOIN_STUDENT", ({ name }) => {
    socket.data.name = name;
    socket.data.role = "student";
    broadcastParticipants();
  });

  socket.on("JOIN_TEACHER", () => {
    socket.data.name = "Teacher";
    socket.data.role = "teacher";
  });
  /* GET PARTICIPANTS (ON DEMAND) */
socket.on("GET_PARTICIPANTS", () => {
  broadcastParticipants();
});


  /* ✅ FIXED: ASK QUESTION */
  socket.on(
    "ASK_QUESTION",
    ({ question, options, correctOptions, duration }) => {
      if (activeQuestion) return;

      // ✅ Correct validation (NO alert)
      if (!correctOptions || correctOptions.length === 0) {
        console.log("No correct option selected");
        return;
      }

      activeQuestion = {
        id: pollId++,
        question,
        options,
        correctOptions,
        duration,
        answers: {},
      };

      io.emit("NEW_QUESTION", activeQuestion);

      questionTimer = setTimeout(endPoll, duration * 1000);
    }
  );

  /* SUBMIT ANSWER */
  socket.on("SUBMIT_ANSWER", ({ optionIndex }) => {
    if (!activeQuestion) return;
    if (activeQuestion.answers[socket.id] !== undefined) return;

    activeQuestion.answers[socket.id] = optionIndex;

    const students = [...io.sockets.sockets.values()].filter(
      (s) => s.data.role === "student"
    ).length;

    if (
      Object.keys(activeQuestion.answers).length === students &&
      students > 0
    ) {
      clearTimeout(questionTimer);
      endPoll();
    }
  });

  /* KICK STUDENT */
  socket.on("KICK_STUDENT", (studentSocketId) => {
    const studentSocket = io.sockets.sockets.get(studentSocketId);

    if (studentSocket) {
      studentSocket.emit("KICKED_OUT");
      setTimeout(() => studentSocket.disconnect(true), 300);
    }

    broadcastParticipants();
  });

  /* POLL HISTORY */
  socket.on("GET_POLL_HISTORY", () => {
    socket.emit("POLL_HISTORY", pollHistory);
  });

  function endPoll() {
    if (!activeQuestion) return;

    const results = calculateResults();

    const poll = {
      id: activeQuestion.id,
      question: activeQuestion.question,
      options: activeQuestion.options,
      correctOptions: activeQuestion.correctOptions,
      results,
    };

    pollHistory.push(poll);

    io.emit("SHOW_RESULTS", {
      poll,
      history: pollHistory,
    });

    activeQuestion = null;
    questionTimer = null;
  }

  socket.on("disconnect", () => {
     console.log("Client disconnected:", socket.id);  
    broadcastParticipants();
  });
});

server.listen(5000, () =>
  console.log("Server running on port 5000")
);

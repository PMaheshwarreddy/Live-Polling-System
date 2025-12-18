import { useEffect, useState } from "react";
import socket from "./socket";

import RoleSelect from "./pages/RoleSelect";
import StudentName from "./pages/StudentName";
import TeacherDashboard from "./pages/TeacherDashboard";
import Waiting from "./pages/Waiting";
import StudentQuestion from "./pages/StudentQuestion";
import Results from "./pages/Results";
import KickedOut from "./pages/KickedOut";

import "./index.css";

function App() {
  const [role, setRole] = useState(null);
  const [step, setStep] = useState("role");

  const [question, setQuestion] = useState(null);
  const [results, setResults] = useState(null);

  /*  CENTRALIZED CHAT STATE */
  const [messages, setMessages] = useState([]);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected:", socket.id);
      setMyId(socket.id);
    });

    socket.on("RECEIVE_MESSAGE", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("SHOW_RESULTS", ({ poll, history }) => {
  setResults({ poll, history });
  setStep("results");
});
 socket.on("KICKED_OUT", () => {
    setStep("kicked");
  });

    return () => {
      socket.off("connect");
      socket.off("RECEIVE_MESSAGE");
      socket.off("SHOW_RESULTS");
      socket.off("KICKED_OUT");
    };
  }, []);

  const sendMessage = (text) => {
    if (!text.trim()) return;
    socket.emit("SEND_MESSAGE", text);
  };

  /* ---------------- ROLE ---------------- */
  if (step === "role") {
    return (
      <RoleSelect
        onContinue={(r) => {
          setRole(r);
          setStep(r === "student" ? "student-name" : "teacher");
        }}
      />
    );
  }

  /* ---------------- TEACHER ---------------- */
  if (step === "teacher") {
    return (
      <TeacherDashboard
        messages={messages}
        sendMessage={sendMessage}
        myId={myId}
      />
    );
  }

  /* ---------------- STUDENT NAME ---------------- */
  if (step === "student-name") {
    return <StudentName onContinue={() => setStep("waiting")} />;
  }
  if (step === "kicked") {
  return <KickedOut />;
}

  /* ---------------- WAITING ---------------- */
  if (step === "waiting") {
    return (
      <Waiting
        onQuestion={(q) => {
          setQuestion(q);
          setStep("question");
        }}
      />
    );
  }

  /* ---------------- QUESTION ---------------- */
  if (step === "question") {
    return (
      <StudentQuestion
        data={question}
        onSubmitted={() => setStep("waiting")}
        messages={messages}
        sendMessage={sendMessage}
        myId={myId}
      />
    );
  }

  /* ---------------- RESULTS ---------------- */
  if (step === "results") {
  return (
    <Results
      poll={results.poll}
      history={results.history}
    />
  );
}


  return null;
}

export default App;

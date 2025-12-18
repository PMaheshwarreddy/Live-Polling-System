import { useState } from "react";
import socket from "../socket";
import "./StudentName.css";

function StudentName({ onContinue }) {
  const [name, setName] = useState("");

  const handleContinue = () => {
    if (!name.trim()) return;

    // Save name per tab
    sessionStorage.setItem("studentName", name);

    // Notify server
    socket.emit("JOIN_STUDENT", { name });

    // Move to waiting screen
    onContinue();
  };

  return (
    <div className="student-wrapper">
      <div className="student-badge">✨ Intervue Poll</div>

      <h1 className="student-title">Let’s Get Started</h1>

      <p className="student-subtitle">
        If you’re a student, you’ll be able to{" "}
        <strong>submit your answers</strong>, participate in live polls, and see
        how your responses compare with your classmates
      </p>

      <input
        type="text"
        placeholder="Enter your Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="student-input"
      />

      <button
        className="student-btn"
        disabled={!name.trim()}
        onClick={handleContinue}
      >
        Continue
      </button>
    </div>
  );
}

export default StudentName;

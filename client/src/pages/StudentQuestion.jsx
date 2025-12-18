import { useState } from "react";
import socket from "../socket";
import Timer from "../components/Timer";
import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";

import "./StudentQuestion.css";

function StudentQuestion({ data, onSubmitted }) {
  const [selected, setSelected] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState("chat");

  const submitAnswer = () => {
    if (selected === null) return;
    socket.emit("SUBMIT_ANSWER", { optionIndex: selected });
    onSubmitted();
  };

  return (
    <div className="student-question-wrapper">
      {/* TOP LINE */}
      <div className="question-top-line">
        <span className="question-count">Question 1</span>
        <Timer duration={data.duration || 15} />
      </div>

      {/* QUESTION CARD */}
      <div className="question-card">
        <div className="question-title-bar">
          {data.question}
        </div>

        <div className="options-container">
          {data.options.map((opt, i) => (
            <div
              key={i}
              className={`option-item ${selected === i ? "active" : ""}`}
              onClick={() => setSelected(i)}
            >
              <div className="option-number">{i + 1}</div>
              <div className="option-text">{opt}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SUBMIT */}
      <button
        className="submit-btn"
        disabled={selected === null}
        onClick={submitAnswer}
      >
        Submit
      </button>

      {/* CHAT FAB */}
      <div className="chat-fab" onClick={() => setShowPanel(!showPanel)}>
        💬
      </div>

      {/* SIDE PANEL */}
      {showPanel && (
        <div className="side-panel">
          <div className="panel-tabs">
            <span
              className={panelTab === "chat" ? "active" : ""}
              onClick={() => setPanelTab("chat")}
            >
              Chat
            </span>
            <span
              className={panelTab === "participants" ? "active" : ""}
              onClick={() => setPanelTab("participants")}
            >
              Participants
            </span>
          </div>

          {panelTab === "chat" && <ChatPanel />}
          {panelTab === "participants" && <ParticipantsPanel />}
        </div>
      )}
    </div>
  );
}

export default StudentQuestion;

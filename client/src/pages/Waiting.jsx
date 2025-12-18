import { useEffect, useState } from "react";
import socket from "../socket";

import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";

import "./Waiting.css";

function Waiting({ onQuestion }) {
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState("chat");

  useEffect(() => {
    // socket.on("NEW_QUESTION", (data) => {
    //   onQuestion(data);
    // });
socket.on("NEW_QUESTION", (question) => {
      onQuestion(question);
    });
    return () => socket.off("NEW_QUESTION");
  }, [onQuestion]);

  return (
    <div className="waiting-wrapper">
      {/* Badge */}
      <div className="waiting-badge">✨ Intervue Poll</div>

      {/* Loader */}
      <div className="waiting-loader"></div>

      {/* Text */}
      <p className="waiting-text">
        Wait for the teacher to ask questions..
      </p>

      {/* Floating chat button */}
      <div className="chat-fab" onClick={() => setShowPanel(!showPanel)}>
        💬
      </div>

      {/* Side Panel */}
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

export default Waiting;

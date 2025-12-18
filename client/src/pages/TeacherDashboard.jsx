// import { useState, useEffect } from "react";
// import socket from "../socket";

// import ChatPanel from "../components/ChatPanel";
// import ParticipantsPanel from "../components/ParticipantsPanel";

// import "./TeacherDashboard.css";

// function TeacherDashboard() {
//   const [question, setQuestion] = useState("");
//   const [options, setOptions] = useState(["", ""]);
//   const [duration, setDuration] = useState(60);

//   const [showPanel, setShowPanel] = useState(false);
//   const [panelTab, setPanelTab] = useState("chat");

//   // Register teacher once
//   useEffect(() => {
//     socket.emit("JOIN_TEACHER");
//   }, []);

//   const handleAskQuestion = () => {
//     if (!question.trim()) return;

//     socket.emit("ASK_QUESTION", {
//       question,
//       options,
//       duration,
//     });

//     setQuestion("");
//     setOptions(["", ""]);
//   };

//   return (
//     <div className="teacher-wrapper">
//       {/* Header */}
//       <div className="teacher-header">
//         <div className="teacher-badge">✨ Intervue Poll</div>
//       </div>

//       {/* Title */}
//       <h1 className="teacher-title">Let’s Get Started</h1>
//       <p className="teacher-subtitle">
//         You’ll have the ability to create and manage polls, ask questions, and
//         monitor your students’ responses in real-time.
//       </p>

//       {/* Question Section */}
//       <div className="question-section">
//         <div className="question-header">
//           <label>Enter your question</label>

//           <select
//             value={duration}
//             onChange={(e) => setDuration(Number(e.target.value))}
//           >
//             <option value={60}>60 seconds</option>
//             <option value={45}>45 seconds</option>
//             <option value={30}>30 seconds</option>
//           </select>
//         </div>

//         <div className="question-box">
//           <textarea
//             placeholder="Type your question here..."
//             value={question}
//             maxLength={100}
//             onChange={(e) => setQuestion(e.target.value)}
//           />
//           <span className="char-count">{question.length}/100</span>
//         </div>
//       </div>

//       {/* Options Section */}
//       <div className="options-section">
//         <label>Edit Options</label>

//         {options.map((opt, i) => (
//           <div key={i} className="option-row">
//             <span className="option-index">{i + 1}</span>
//             <input
//               placeholder="Option text"
//               value={opt}
//               onChange={(e) => {
//                 const copy = [...options];
//                 copy[i] = e.target.value;
//                 setOptions(copy);
//               }}
//             />
//           </div>
//         ))}

//         <button
//           className="add-option-btn"
//           onClick={() => setOptions([...options, ""])}
//         >
//           + Add more option
//         </button>
//       </div>

//       {/* Ask Question Button */}
//       <div className="ask-btn-wrapper">
//         <button className="teacher-btn" onClick={handleAskQuestion}>
//           Ask Question
//         </button>
//       </div>

//       {/* Floating Chat Button */}
//       <div className="chat-fab" onClick={() => setShowPanel(!showPanel)}>
//         💬
//       </div>

//       {/* Side Panel */}
//       {showPanel && (
//         <div className="side-panel">
//           <div className="panel-tabs">
//             <span
//               className={panelTab === "chat" ? "active" : ""}
//               onClick={() => setPanelTab("chat")}
//             >
//               Chat
//             </span>
//             <span
//               className={panelTab === "participants" ? "active" : ""}
//               onClick={() => setPanelTab("participants")}
//             >
//               Participants
//             </span>
//           </div>

//           {/*  CORRECT USAGE */}
//           {panelTab === "chat" && <ChatPanel />}
//           {panelTab === "participants" && <ParticipantsPanel />}
//         </div>
//       )}
//     </div>
//   );
// }

// export default TeacherDashboard;









// import { useState, useEffect } from "react";
// import socket from "../socket";

// import ChatPanel from "../components/ChatPanel";
// import ParticipantsPanel from "../components/ParticipantsPanel";

// import "./TeacherDashboard.css";

// function TeacherDashboard() {
//   const [question, setQuestion] = useState("");
//  // const [options, setOptions] = useState(["", ""]);
//  const [options, setOptions] = useState([
//   { text: "", isCorrect: false },
//   { text: "", isCorrect: false },
// ]);

//   const [duration, setDuration] = useState(60);

//   const [showPanel, setShowPanel] = useState(false);
//   const [panelTab, setPanelTab] = useState("chat");

//   // Register teacher once
//   useEffect(() => {
//     socket.emit("JOIN_TEACHER");
//   }, []);

//   const handleAskQuestion = () => {
//     if (!question.trim()) return;

//     // socket.emit("ASK_QUESTION", {
//     //   question,
//     //   options,
//     //   duration,
//     // });
//     socket.emit("ASK_QUESTION", {
//   question,
//   options: options.map(o => o.text),
//   correctOptions: options
//     .map((o, i) => (o.isCorrect ? i : null))
//     .filter(i => i !== null),
//   duration,
// });


//     setQuestion("");
//     setOptions(["", ""]);
//   };

//   return (
//     <div className="teacher-wrapper">
//       {/* Header */}
//       <div className="teacher-header">
//         <div className="teacher-badge">✨ Intervue Poll</div>
//       </div>

//       {/* Title */}
//       <h1 className="teacher-title">Let’s Get Started</h1>
//       <p className="teacher-subtitle">
//         You’ll have the ability to create and manage polls, ask questions, and
//         monitor your students’ responses in real-time.
//       </p>

//       {/* Question Section */}
//       <div className="question-section">
//         <div className="question-header">
//           <label>Enter your question</label>

//           <select
//             value={duration}
//             onChange={(e) => setDuration(Number(e.target.value))}
//           >
//             <option value={60}>60 seconds</option>
//             <option value={45}>45 seconds</option>
//             <option value={30}>30 seconds</option>
//           </select>
//         </div>

//         <div className="question-box">
//           <textarea
//             placeholder="Type your question here..."
//             value={question}
//             maxLength={100}
//             onChange={(e) => setQuestion(e.target.value)}
//           />
//           <span className="char-count">{question.length}/100</span>
//         </div>
//       </div>

//       {/* Options Section */}
//       <div className="options-section">
//         <label>Edit Options</label>

//         {/* {options.map((opt, i) => (
//           <div key={i} className="option-row">
//             <span className="option-index">{i + 1}</span>
//             <input
//               placeholder="Option text"
//               value={opt}
//               onChange={(e) => {
//                 const copy = [...options];
//                 copy[i] = e.target.value;
//                 setOptions(copy);
//               }}
//             />
//           </div>
//         ))} */}


//         {options.map((opt, i) => (
//   <div key={i} className="option-row">
//     <span className="option-index">{i + 1}</span>

//     <input
//       placeholder="Option text"
//       value={opt.text}
//       onChange={(e) => {
//         const copy = [...options];
//         copy[i].text = e.target.value;
//         setOptions(copy);
//       }}
//     />

//     {/* Is Correct */}
//     <div className="correct-toggle">
//       <span>Is it Correct?</span>

//       <label>
//         <input
//           type="radio"
//           name={`correct-${i}`}
//           checked={opt.isCorrect === true}
//           onChange={() => {
//             const copy = [...options];
//             copy[i].isCorrect = true;
//             setOptions(copy);
//           }}
//         />
//         Yes
//       </label>

//       <label>
//         <input
//           type="radio"
//           name={`correct-${i}`}
//           checked={opt.isCorrect === false}
//           onChange={() => {
//             const copy = [...options];
//             copy[i].isCorrect = false;
//             setOptions(copy);
//           }}
//         />
//         No
//       </label>
//     </div>
//   </div>
// ))}




//        <button
//   className="add-option-btn"
//   onClick={() =>
//     setOptions([
//       ...options,
//       { text: "", isCorrect: false }
//     ])
//   }
// >
//   + Add more option
// </button>


//       {/* Ask Question Button */}
//       <div className="ask-btn-wrapper">
//         <button className="teacher-btn" onClick={handleAskQuestion}>
//           Ask Question
//         </button>
//       </div>

//       {/* Floating Chat Button */}
//       <div className="chat-fab" onClick={() => setShowPanel(!showPanel)}>
//         💬
//       </div>

//       {/* Side Panel */}
//       {showPanel && (
//         <div className="side-panel">
//           <div className="panel-tabs">
//             <span
//               className={panelTab === "chat" ? "active" : ""}
//               onClick={() => setPanelTab("chat")}
//             >
//               Chat
//             </span>
//             <span
//               className={panelTab === "participants" ? "active" : ""}
//               onClick={() => setPanelTab("participants")}
//             >
//               Participants
//             </span>
//           </div>

//           {/*  CORRECT USAGE */}
//           {panelTab === "chat" && <ChatPanel />}
//           {panelTab === "participants" && <ParticipantsPanel />}
//         </div>
//       )}
//     </div>
//   );
// }

// export default TeacherDashboard;





import { useState, useEffect } from "react";
import socket from "../socket";

import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";

import "./TeacherDashboard.css";

function TeacherDashboard() {
  const [question, setQuestion] = useState("");

  const [options, setOptions] = useState([
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  const [duration, setDuration] = useState(60);

  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState("chat");

  useEffect(() => {
    socket.emit("JOIN_TEACHER");
  }, []);

  const handleAskQuestion = () => {
    if (!question.trim()) return;

    socket.emit("ASK_QUESTION", {
      question,
      options: options.map(o => o.text),
      correctOptions: options
        .map((o, i) => (o.isCorrect ? i : null))
        .filter(i => i !== null),
      duration,
    });

    setQuestion("");
    setOptions([
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ]);
  };

  return (
    <div className="teacher-wrapper">
      {/* Header */}
      <div className="teacher-header">
        <div className="teacher-badge">✨ Intervue Poll</div>
      </div>

      <h1 className="teacher-title">Let’s Get Started</h1>
      <p className="teacher-subtitle">
        You’ll have the ability to create and manage polls, ask questions, and
        monitor your students’ responses in real-time.
      </p>

      {/* Question Section */}
      <div className="question-section">
        <div className="question-header">
          <label>Enter your question</label>

          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            <option value={60}>60 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={30}>30 seconds</option>
          </select>
        </div>

        <div className="question-box">
          <textarea
            placeholder="Type your question here..."
            value={question}
            maxLength={100}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <span className="char-count">{question.length}/100</span>
        </div>
      </div>

      {/* Options Section */}
      <div className="options-section">
        <label>Edit Options</label>

        {options.map((opt, i) => (
          <div key={i} className="option-row">
            <span className="option-index">{i + 1}</span>

            <input
              placeholder="Option text"
              value={opt.text}
              onChange={(e) => {
                const copy = [...options];
                copy[i].text = e.target.value;
                setOptions(copy);
              }}
            />

            <div className="correct-toggle">
              <span>Is it Correct?</span>

              <label>
                <input
                  type="radio"
                  name={`correct-${i}`}
                  checked={opt.isCorrect === true}
                  onChange={() => {
                    const copy = [...options];
                    copy[i].isCorrect = true;
                    setOptions(copy);
                  }}
                />
                Yes
              </label>

              <label>
                <input
                  type="radio"
                  name={`correct-${i}`}
                  checked={opt.isCorrect === false}
                  onChange={() => {
                    const copy = [...options];
                    copy[i].isCorrect = false;
                    setOptions(copy);
                  }}
                />
                No
              </label>
            </div>
          </div>
        ))}

        <button
          className="add-option-btn"
          onClick={() =>
            setOptions([...options, { text: "", isCorrect: false }])
          }
        >
          + Add more option
        </button>
      </div> {/*  FIXED: closed options-section */}

      {/* Ask Question Button */}
      <div className="ask-btn-wrapper">
        <button className="teacher-btn" onClick={handleAskQuestion}>
          Ask Question
        </button>
      </div>

      {/* Floating Chat Button */}
      <div className="chat-fab" onClick={() => setShowPanel(!showPanel)}>
        💬
      </div>

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

export default TeacherDashboard;

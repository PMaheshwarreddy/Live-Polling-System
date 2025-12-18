// import "./Results.css";

// function Results({ question, results }) {
//   return (
//     <div className="results-page">
//       {/* TOP LINE */}
//       <div className="results-top-line">
//         <span className="question-count">Question 1</span>
//       </div>

//       {/* QUESTION CARD */}
//       <div className="results-card">
//         {/* QUESTION HEADER */}
//         <div className="results-question-bar">
//           {question.question}
//         </div>

//         {/* OPTIONS */}
//         <div className="results-options">
//           {question.options.map((opt, i) => {
//             const percentage = results[i]?.percentage || 0;

//             return (
//               <div key={i} className="result-option">
//                 <div className="option-left">
//                   <span className="option-circle">{i + 1}</span>
//                   <span className="option-text">{opt}</span>
//                 </div>

//                 <div className="option-bar">
//                   <div
//                     className="option-bar-fill"
//                     style={{ width: `${percentage}%` }}
//                   />
//                 </div>

//                 <span className="option-percent">{percentage}%</span>
//               </div>
//             );
//           })}
//         </div>
//       </div>
//     </div>
//   );
// }

// export default Results;

import { useState } from "react";
import "./Results.css";

function Results({ poll, history }) {
  const [showHistory, setShowHistory] = useState(false);

  if (!poll) return null;

  const renderPoll = (p) => (
    <div key={p.id} className="results-card">
      <div className="results-question-bar">
        {p.question}
      </div>

      <div className="results-options">
        {p.options.map((opt, i) => (
          <div key={i} className="result-option">
            <div className="option-left">
              <span className="option-circle">{i + 1}</span>
              <span className="option-text">{opt}</span>
            </div>

            <div className="option-bar">
              <div
                className="option-bar-fill"
                style={{ width: `${p.results[i].percentage}%` }}
              />
            </div>

            <span className="option-percent">
              {p.results[i].percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="results-page">
      {/* TOP ACTION */}
      <div className="results-actions">
        <button
          className="history-btn"
          onClick={() => setShowHistory(!showHistory)}
        >
          👁 View Poll History
        </button>
      </div>

      {/* CURRENT RESULT */}
      <h3>Question</h3>
      {renderPoll(poll)}

      {/* HISTORY */}
      {showHistory && (
        <div className="history-section">
          <h2>View Poll History</h2>

          <div className="history-scroll">
            {history.map((p) => (
              <div key={p.id}>
                <h4>Question {p.id}</h4>
                {renderPoll(p)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Results;

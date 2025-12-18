import "./KickedOut.css";

function KickedOut() {
  return (
    <div className="kicked-wrapper">
      <div className="kicked-badge">✨ Intervue Poll</div>

      <h1 className="kicked-title">You’ve been Kicked out !</h1>

      <p className="kicked-subtitle">
        Looks like the teacher had removed you from the poll system.
        <br />
        Please try again sometime.
      </p>
    </div>
  );
}

export default KickedOut;

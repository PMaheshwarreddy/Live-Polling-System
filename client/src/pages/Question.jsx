function Question({ data }) {
  return (
    <div style={{ padding: "40px" }}>
      <h3>{data.question}</h3>
      {data.options.map((opt, i) => (
        <div key={i}>{opt}</div>
      ))}
    </div>
  );
}

export default Question;

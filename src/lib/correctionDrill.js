const LABELS = {
  algorithm_selection: "algorithm selection",
  edge_cases: "edge-case handling",
  implementation: "implementation accuracy",
  complexity_analysis: "complexity analysis",
  time_management: "time management",
  premature_solving: "understanding constraints before solving",
  technical_explanation: "technical explanation",
};

const TEMPLATES = {
  algorithm_selection: [
    {
      prompt: "A problem has n up to 100,000 and asks for a result in one pass over the input. Which approach is the most appropriate starting point?",
      options: ["Nested loops over all pairs", "A linear-time scan with suitable state", "Enumerate every permutation", "Brute-force every subarray and sort it"],
      correctOption: 1,
      explanation: "With n = 100,000, an O(n) approach is a sensible target before implementation details are considered.",
    },
    {
      prompt: "Before choosing an algorithm, what should you establish first?",
      options: ["The programming language", "The variable names", "Constraints and required complexity", "The final code structure"],
      correctOption: 2,
      explanation: "Constraints and the required complexity narrow the viable algorithm choices.",
    },
    {
      prompt: "Two approaches are O(n log n) and O(n²), with n up to 200,000. Which should normally be investigated first?",
      options: ["O(n²)", "O(n log n)", "Either without checking constraints", "The one with more code"],
      correctOption: 1,
      explanation: "The constraints make O(n²) impractical at this scale, while O(n log n) is typically viable.",
    },
  ],
  edge_cases: [
    {
      prompt: "Which test is most directly useful for finding an off-by-one error in an array algorithm?",
      options: ["A random large array only", "A single-element array and boundary positions", "Only sorted input", "Only duplicate-free input"],
      correctOption: 1,
      explanation: "Small boundary-focused inputs expose indexing assumptions quickly.",
    },
    {
      prompt: "For a function processing a list, which case should be deliberately checked?",
      options: ["Empty input when the contract permits it", "Only the average-sized input", "Only positive values", "Only the first sample"],
      correctOption: 0,
      explanation: "Empty input is a common boundary condition and should be tested when valid.",
    },
    {
      prompt: "A correct solution works for typical values but fails when two values are equal. What should you inspect first?",
      options: ["Equality/duplicate handling", "The UI color", "The database schema", "The deployment region"],
      correctOption: 0,
      explanation: "Duplicate/equality behavior is directly related to the observed failure.",
    },
  ],
  implementation: [
    {
      prompt: "What is the safest first step when code passes the idea-level reasoning but fails a test?",
      options: ["Change random lines", "Compare the failing input with the code's state transitions", "Ignore the test", "Increase the time limit"],
      correctOption: 1,
      explanation: "Tracing the failing case connects the intended algorithm to the actual implementation.",
    },
    {
      prompt: "Which practice reduces implementation mistakes?",
      options: ["Skipping small tests", "Using meaningful invariants and testing after small changes", "Writing everything in one function", "Avoiding edge cases"],
      correctOption: 1,
      explanation: "Small verified changes and explicit invariants make implementation errors easier to isolate.",
    },
    {
      prompt: "If an index is used to access arr[index + 1], what should be checked?",
      options: ["That index + 1 stays within the valid range", "Only the array's name", "Only the compiler version", "Nothing if the input is large"],
      correctOption: 0,
      explanation: "The expression can exceed the last valid index and needs a boundary check.",
    },
  ],
  complexity_analysis: [
    {
      prompt: "A loop runs n times and performs O(1) work each iteration. What is its time complexity?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
      correctOption: 2,
      explanation: "Constant work repeated n times gives O(n).",
    },
    {
      prompt: "Two nested loops each run n times independently. What is the usual time complexity?",
      options: ["O(1)", "O(n)", "O(n log n)", "O(n²)"],
      correctOption: 3,
      explanation: "n iterations multiplied by n iterations gives n² iterations.",
    },
    {
      prompt: "Why should constraints be checked before selecting an algorithm?",
      options: ["They indicate which complexity classes are feasible", "They choose variable names", "They remove the need for testing", "They guarantee correctness"],
      correctOption: 0,
      explanation: "Input limits determine whether an algorithm can finish within practical resource limits.",
    },
  ],
  time_management: [
    {
      prompt: "If a coding problem has a strict time limit, what is a useful habit before implementing?",
      options: ["Spend the whole time on syntax", "Estimate complexity and time-box exploration", "Skip constraints", "Start coding immediately"],
      correctOption: 1,
      explanation: "A quick complexity estimate and time box helps prevent spending the whole attempt on an unsuitable approach.",
    },
    {
      prompt: "After repeated failure with one approach during a timed assessment, what is a useful next action?",
      options: ["Keep changing syntax", "Re-check constraints and consider an alternative approach", "Submit without testing", "Delete the problem"],
      correctOption: 1,
      explanation: "Re-checking constraints can reveal that the chosen approach is the bottleneck.",
    },
    {
      prompt: "What should a time-box mainly protect against?",
      options: ["Reading the problem", "Indefinitely pursuing an approach that is not working", "Testing edge cases", "Explaining the solution"],
      correctOption: 1,
      explanation: "Time-boxing limits unproductive persistence while leaving room for a strategic pivot.",
    },
  ],
  premature_solving: [
    {
      prompt: "What should normally happen before writing the first line of solution code?",
      options: ["Read only the sample", "Identify constraints, inputs, outputs, and a candidate approach", "Choose random variable names", "Start optimizing"],
      correctOption: 1,
      explanation: "Understanding the problem and constraints first reduces the chance of implementing the wrong approach.",
    },
    {
      prompt: "A student starts coding after reading only the first example. What observable step is missing?",
      options: ["Problem and constraint analysis", "Typing speed", "Color selection", "Deployment"],
      correctOption: 0,
      explanation: "The missing step is structured understanding of the full problem statement and constraints.",
    },
    {
      prompt: "Which sequence is most defensible for a new coding problem?",
      options: ["Code → guess → read constraints", "Constraints → approach → complexity → code → test", "Code → submit → understand", "Optimize → understand → code"],
      correctOption: 1,
      explanation: "The sequence connects requirements to a justified approach before implementation.",
    },
  ],
  technical_explanation: [
    {
      prompt: "What makes a technical explanation easier to evaluate?",
      options: ["Only naming the final answer", "Structure: approach, why it works, complexity, and trade-offs", "Speaking as quickly as possible", "Avoiding technical details"],
      correctOption: 1,
      explanation: "A structured explanation exposes the reasoning an interviewer needs to evaluate.",
    },
    {
      prompt: "When explaining an algorithm, what should usually come after the approach?",
      options: ["Why the approach works", "The weather", "The UI design", "A different unrelated problem"],
      correctOption: 0,
      explanation: "Explaining correctness connects the selected approach to the problem requirements.",
    },
    {
      prompt: "Which complexity statement is most useful in an interview?",
      options: ["It is fast", "It is optimized", "Time O(n), space O(1), with the relevant constraint context", "It should work"],
      correctOption: 2,
      explanation: "Concrete complexity and context make the performance claim testable.",
    },
  ],
};

export function generateFallbackQuestions(failurePattern, count = 3, prefix = "drill") {
  const source = TEMPLATES[failurePattern] || TEMPLATES.algorithm_selection;
  return source.slice(0, Math.min(count, source.length)).map((q, i) => ({
    ...q,
    questionId: `${prefix}_${failurePattern}_${i + 1}`,
  }));
}

export function scoreQuestions(questions, answers) {
  let correct = 0;
  for (const q of questions) {
    if (Number(answers?.[q.questionId]) === q.correctOption) correct += 1;
  }
  return questions.length ? Math.round((correct / questions.length) * 100) : 0;
}

export function failureLabel(pattern) {
  return LABELS[pattern] || pattern.replaceAll("_", " ");
}

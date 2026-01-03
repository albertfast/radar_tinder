
interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  image?: string;
}

const US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", 
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", 
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", 
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", 
    "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", 
    "West Virginia", "Wisconsin", "Wyoming"
];

const generateMockQuestions = (currentState: string) => {
    return Array(20).fill(null).map((_, i) => ({
        id: i + 1,
        question: `[${currentState}] Practice Question ${i + 1}: What should you do when...`,
        options: ["Stop immediately", "Proceed with caution", "Honk your horn", "Speed up"],
        correctAnswer: "Proceed with caution",
        explanation: `This is a placeholder explanation for ${currentState} question #${i + 1}. In the real app, this would be specific state law data.`
    }));
};

// Populate Data for all states
export const PERMIT_TEST_DATA: Record<string, Question[]> = {};

US_STATES.forEach(state => {
    PERMIT_TEST_DATA[state] = generateMockQuestions(state);
});

// Override specific states with real data if available
PERMIT_TEST_DATA['California'] = [
    {
      id: 1,
      question: "It is illegal for a person 21 years of age or older to drive with a blood alcohol concentration (BAC) that is ___ or higher.",
      options: ["0.08%", "0.10%", "0.05%"],
      correctAnswer: "0.08%",
      explanation: "It is illegal for any person to operate a vehicle with a BAC of 0.08% or higher, if the person is 21 years old or older."
    },
    {
      id: 2,
      question: "You must notify the DMV within 5 days if you:",
      options: ["Sell or transfer your vehicle", "Paint your vehicle a different color", "Are cited for a traffic violation"],
      correctAnswer: "Sell or transfer your vehicle",
      explanation: "If you sell or transfer a vehicle, you must notify the DMV within 5 days."
    },
    {
      id: 3,
      question: "You are driving on a freeway posted for 65 MPH. Traffic is heavy and moving at 35 MPH. The best speed for your vehicle is most likely:",
      options: ["35 MPH", "30 MPH", "25 MPH"],
      correctAnswer: "35 MPH",
      explanation: "Drive with the flow of traffic. Driving faster or slower than other traffic can be dangerous."
    },
    {
      id: 4,
      question: "Is it illegal to listen to music through headphones that cover both ears?",
      options: ["Yes", "No", "Only if the volume is too loud"],
      correctAnswer: "Yes",
      explanation: "You may not drive continuously with headphones covering both ears."
    },
    ...generateMockQuestions('California').slice(4) 
];

// Add NY overrides similarly...

export const getQuestionsForState = (state: string): Question[] => {
    return PERMIT_TEST_DATA[state] || generateMockQuestions(state);
};

export const getAllStates = () => US_STATES;

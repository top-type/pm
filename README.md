# Real-Time LMSR Prediction Market

A real-time web application for creating and betting in prediction markets using the Logarithmic Market Scoring Rule (LMSR).

## Features

- Create prediction markets with multiple outcomes
- Place bets on market outcomes using LMSR pricing
- Real-time updates of market prices and bets
- In-memory database for testing purposes
- User registration and balance tracking
- Visualize market probabilities with charts

## Technologies Used

- Node.js
- Express.js
- Socket.io for real-time communication
- EJS for templating
- Chart.js for data visualization
- Bootstrap for UI

## LMSR Explanation

The Logarithmic Market Scoring Rule (LMSR) is a popular automated market maker mechanism for prediction markets. It ensures that:

1. There's always liquidity in the market
2. The market maker has bounded loss
3. Prices reflect the probability of outcomes

The key formulas used in this implementation:

- **Cost function**: C(q) = b * ln(∑ exp(q_i / b))
- **Price function**: p_i = exp(q_i / b) / ∑ exp(q_j / b)

Where:
- q_i is the quantity of outcome i
- b is the liquidity parameter (higher values make prices less sensitive to trades)

## Getting Started

### Prerequisites

- Node.js (v12 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository or download the source code
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Running the Application

Start the server:

```bash
node src/server.js
```

The application will be available at http://localhost:3000

## Usage

1. **Register/Login**: Enter a username to register or login
2. **Create a Market**: Click "Create Market" and fill in the details
   - Market Title: A clear title for your prediction market
   - Description: Detailed description of what the market is about
   - Outcomes: At least two possible outcomes
   - Liquidity Parameter: Controls price sensitivity (recommended: 100-1000)
3. **Place Bets**: Navigate to a market and place bets on outcomes
   - Higher bets will move the price more significantly
   - The cost is calculated using the LMSR formula
   - Your balance will be updated in real-time

## Development Notes

- This application uses an in-memory database for simplicity
- For production use, you would want to implement:
  - Persistent database (MongoDB, PostgreSQL, etc.)
  - User authentication with passwords
  - Market resolution mechanism
  - Admin controls

## License

MIT 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const math = require('mathjs');
// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory database for markets and users
const db = {
  users: {},
  markets: {},
  nextMarketId: 1,
  nextUserId: 1
};

// LMSR (Logarithmic Market Scoring Rule) functions
function calculateCost(q, b) {
  // q is an array of quantities for each outcome
  // b is the liquidity parameter
  try {
    return b * math.log(math.sum(q.map(qi => math.exp(qi / b))));
  } catch (error) {
    console.error('Error in calculateCost:', error);
    return 0; // Fallback value
  }
}

function calculatePrice(q, b, outcomeIndex) {
  // Calculate the current price for a specific outcome
  try {
    // Handle the case when all quantities are zero (equal probabilities)
    const allZeros = q.every(qi => qi === 0);
    if (allZeros) {
      console.log(`Equal probabilities for market with ${q.length} outcomes: ${1/q.length}`);
      return 1 / q.length; // Equal probability for all outcomes
    }
    
    // Handle the case when liquidity parameter is zero or invalid
    if (!b || b <= 0) {
      console.error('Invalid liquidity parameter:', b);
      return 1 / q.length; // Fallback to equal probabilities
    }
    
    const expSum = math.sum(q.map(qi => math.exp(qi / b)));
    const price = math.exp(q[outcomeIndex] / b) / expSum;
    
    // Validate the calculated price
    if (isNaN(price) || !isFinite(price)) {
      console.error('Invalid price calculated:', price);
      console.error('Quantities:', q);
      console.error('Liquidity parameter:', b);
      console.error('Outcome index:', outcomeIndex);
      return 1 / q.length; // Fallback to equal probabilities
    }
    
    return price;
  } catch (error) {
    console.error('Error in calculatePrice:', error);
    return 1 / q.length; // Fallback to equal probabilities
  }
}

function calculateCostDifference(q, b, outcomeIndex, quantity) {
  // Calculate the cost difference when buying 'quantity' of outcome 'outcomeIndex'
  try {
    const newQ = [...q];
    newQ[outcomeIndex] += quantity;
    return calculateCost(newQ, b) - calculateCost(q, b);
  } catch (error) {
    console.error('Error in calculateCostDifference:', error);
    return quantity; // Fallback to linear cost
  }
}

// Routes
app.get('/', (req, res) => {
  res.render('index', { markets: Object.values(db.markets) });
});

app.get('/market/:id', (req, res) => {
  const market = db.markets[req.params.id];
  if (!market) {
    return res.status(404).send('Market not found');
  }
  
  console.log(`Rendering market ${req.params.id}`);
  
  // Validate market data
  if (!market.quantities || !Array.isArray(market.quantities)) {
    console.error('Invalid quantities in market:', market.quantities);
    market.quantities = Array(market.outcomes.length).fill(0);
  }
  
  if (!market.liquidityParameter || isNaN(market.liquidityParameter) || market.liquidityParameter <= 0) {
    console.error('Invalid liquidity parameter in market:', market.liquidityParameter);
    market.liquidityParameter = 100; // Default value
  }
  
  // Ensure market has price history (for backward compatibility)
  if (!market.priceHistory) {
    console.log('Creating price history for market');
    market.priceHistory = [{
      timestamp: market.created,
      prices: market.outcomes.map((_, i) => {
        const price = calculatePrice(market.quantities, market.liquidityParameter, i);
        console.log(`Calculated price for outcome ${i}:`, price);
        return price;
      })
    }];
  }
  
  res.render('market', { market });
});

// API routes
app.post('/api/markets', (req, res) => {
  const { title, description, outcomes, liquidityParameter } = req.body;
  
  if (!title || !description || !outcomes || !liquidityParameter) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  console.log('Creating new market with:');
  console.log('Title:', title);
  console.log('Outcomes:', outcomes);
  console.log('Liquidity Parameter:', liquidityParameter);
  
  const marketId = db.nextMarketId++;
  const outcomeCount = outcomes.length;
  
  // Initialize with equal quantities
  const quantities = Array(outcomeCount).fill(0);
  console.log('Initial quantities:', quantities);
  
  // Calculate initial prices
  const parsedLiquidityParameter = parseFloat(liquidityParameter);
  console.log('Parsed liquidity parameter:', parsedLiquidityParameter);
  
  // Validate liquidity parameter
  if (isNaN(parsedLiquidityParameter) || parsedLiquidityParameter <= 0) {
    console.error('Invalid liquidity parameter:', liquidityParameter);
    return res.status(400).json({ error: 'Invalid liquidity parameter' });
  }
  
  const initialPrices = outcomes.map((_, i) => {
    const price = calculatePrice(quantities, parsedLiquidityParameter, i);
    console.log(`Initial price for outcome ${i}:`, price);
    return price;
  });
  
  // Initialize price history with timestamps
  const priceHistory = [];
  const timestamp = new Date();
  priceHistory.push({
    timestamp,
    prices: initialPrices
  });
  
  db.markets[marketId] = {
    id: marketId,
    title,
    description,
    outcomes,
    liquidityParameter: parsedLiquidityParameter,
    quantities,
    created: timestamp,
    bets: [],
    priceHistory
  };
  
  console.log('Market created:', db.markets[marketId]);
  
  // Broadcast new market to all clients
  io.emit('newMarket', db.markets[marketId]);
  
  res.status(201).json({ id: marketId });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Create or get user
  socket.on('registerUser', (username, callback) => {
    let user = Object.values(db.users).find(u => u.username === username);
    
    if (!user) {
      const userId = db.nextUserId++;
      user = {
        id: userId,
        username,
        balance: 1000, // Starting balance
        bets: []
      };
      db.users[userId] = user;
    } else {
      // Ensure user's bets have complete information
      user.bets = user.bets.map(bet => {
        // Make sure the market still exists
        const market = db.markets[bet.marketId];
        if (!market) return bet;
        
        // Add outcome name if not present
        if (!bet.outcomeName && bet.outcomeIndex !== undefined && market.outcomes) {
          bet.outcomeName = market.outcomes[bet.outcomeIndex];
        }
        
        return bet;
      });
    }
    
    socket.userId = user.id;
    callback({ success: true, user });
  });
  
  // Place bet
  socket.on('placeBet', (data, callback) => {
    const { marketId, outcomeIndex, amount } = data;
    const userId = socket.userId;
    
    if (!userId || !db.users[userId]) {
      return callback({ success: false, error: 'User not authenticated' });
    }
    
    const user = db.users[userId];
    const market = db.markets[marketId];
    
    if (!market) {
      return callback({ success: false, error: 'Market not found' });
    }
    
    if (outcomeIndex < 0 || outcomeIndex >= market.outcomes.length) {
      return callback({ success: false, error: 'Invalid outcome' });
    }
    
    // Check if this is a buy or sell operation
    const isBuying = amount > 0;
    const isSelling = amount < 0;
    const absAmount = Math.abs(amount);
    
    if (absAmount === 0) {
      return callback({ success: false, error: 'Amount cannot be zero' });
    }
    
    // For selling, check if user has enough shares
    if (isSelling) {
      // Calculate user's position for this outcome
      const userBetsForOutcome = user.bets.filter(
        bet => bet.marketId === parseInt(marketId) && bet.outcomeIndex === outcomeIndex
      );
      
      const userPosition = userBetsForOutcome.reduce((total, bet) => total + bet.amount, 0);
      
      if (userPosition < absAmount) {
        return callback({ success: false, error: `Insufficient shares. You only have ${userPosition} shares of ${market.outcomes[outcomeIndex]}` });
      }
    }
    
    // For buying, check if user has enough balance
    if (isBuying && user.balance < absAmount) {
      return callback({ success: false, error: 'Insufficient balance' });
    }
    
    // Calculate cost using LMSR
    const cost = calculateCostDifference(
      market.quantities, 
      market.liquidityParameter, 
      outcomeIndex, 
      amount // Use the signed amount (positive for buying, negative for selling)
    );
    
    // For buying, check if user has enough balance to cover the cost
    if (isBuying && cost > user.balance) {
      return callback({ success: false, error: 'Insufficient balance for this trade' });
    }
    
    // Update market quantities
    market.quantities[outcomeIndex] += amount;
    
    // Calculate new prices
    const newPrices = market.outcomes.map((_, i) => 
      calculatePrice(market.quantities, market.liquidityParameter, i)
    );
    
    // Record price history
    market.priceHistory.push({
      timestamp: new Date(),
      prices: newPrices
    });
    
    // Limit price history to last 100 points to prevent excessive memory usage
    if (market.priceHistory.length > 100) {
      market.priceHistory.shift();
    }
    
    // Record the bet/trade
    const bet = {
      id: Date.now(),
      userId,
      username: user.username,
      marketId,
      outcomeIndex,
      outcomeName: market.outcomes[outcomeIndex],
      amount, // Store the signed amount
      cost,
      timestamp: new Date()
    };
    
    market.bets.push(bet);
    user.bets.push(bet);
    
    // Update user balance
    // For buying: balance decreases by cost
    // For selling: balance increases by |cost|
    user.balance -= cost;
    
    // Broadcast market update to all clients
    io.emit('marketUpdate', {
      marketId,
      quantities: market.quantities,
      prices: newPrices,
      priceHistory: market.priceHistory,
      newBet: bet,
      totalBets: market.bets.length
    });
    
    callback({ 
      success: true, 
      cost,
      newBalance: user.balance,
      prices: newPrices,
      bet: bet
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
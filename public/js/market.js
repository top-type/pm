// Connect to Socket.io server
const socket = io();

// DOM Elements
const loginBtn = document.getElementById('loginBtn');
const loginBtnAlert = document.getElementById('loginBtnAlert');
const submitLoginBtn = document.getElementById('submitLoginBtn');
const usernameInput = document.getElementById('usernameInput');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('username');
const balanceDisplay = document.getElementById('balance');
const betForm = document.getElementById('betForm');
const loginAlert = document.getElementById('loginAlert');
const tradeTypeSelect = document.getElementById('tradeTypeSelect');
const outcomeSelect = document.getElementById('outcomeSelect');
const betAmount = document.getElementById('betAmount');
const placeBetBtn = document.getElementById('placeBetBtn');
const betCostEstimate = document.getElementById('betCostEstimate');
const betsContainer = document.getElementById('betsContainer');
const probabilityBadges = document.querySelectorAll('.probability-badge');
const userPositionContainer = document.getElementById('userPositionContainer');
const noPositionAlert = document.getElementById('noPositionAlert');
const userPositionTable = document.getElementById('userPositionTable');
const userPositionTableBody = document.getElementById('userPositionTableBody');

// Market data (initialized from the EJS template)
let quantities = [...initialQuantities];
console.log('Initial quantities:', quantities);
console.log('Liquidity parameter:', liquidityParameter);

// Calculate initial prices
let prices = calculatePrices(quantities, liquidityParameter);
console.log('Calculated prices:', prices);

let priceHistory = initialPriceHistory || [{ timestamp: new Date(), prices }];

// User data
let currentUser = null;

// Initialize price history chart
const priceCtx = document.getElementById('priceHistoryChart').getContext('2d');
const priceHistoryChart = new Chart(priceCtx, {
  type: 'line',
  data: {
    datasets: marketOutcomes.map((outcome, index) => ({
      label: outcome,
      data: [{ x: new Date(), y: prices[index] * 100 }],
      borderColor: generateColors(marketOutcomes.length)[index],
      backgroundColor: 'transparent',
      tension: 0.1,
      pointRadius: 2,
      pointHoverRadius: 5
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: {
            minute: 'HH:mm'
          },
          tooltipFormat: 'MMM d, yyyy HH:mm:ss'
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Probability (%)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
          }
        }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    }
  }
});

// Check for stored user
const storedUser = localStorage.getItem('predictionMarketUser');
if (storedUser) {
  try {
    const userData = JSON.parse(storedUser);
    registerUser(userData.username);
  } catch (e) {
    console.error('Failed to parse stored user data', e);
    localStorage.removeItem('predictionMarketUser');
  }
} else {
  // Show login alert
  if (loginAlert) {
    loginAlert.classList.remove('d-none');
  }
}

// Event Listeners
loginBtn.addEventListener('click', () => {
  const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
  loginModal.show();
});

if (loginBtnAlert) {
  loginBtnAlert.addEventListener('click', () => {
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
  });
}

submitLoginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (username) {
    registerUser(username);
    const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
    loginModal.hide();
  }
});

if (outcomeSelect && betAmount) {
  // Update cost estimate when trade type, bet amount or outcome changes
  tradeTypeSelect.addEventListener('change', updateCostEstimate);
  outcomeSelect.addEventListener('change', updateCostEstimate);
  betAmount.addEventListener('input', updateCostEstimate);
  
  // Initial cost estimate
  updateCostEstimate();
}

if (placeBetBtn) {
  placeBetBtn.addEventListener('click', placeBet);
}

// Functions
function registerUser(username) {
  socket.emit('registerUser', username, (response) => {
    if (response.success) {
      currentUser = response.user;
      localStorage.setItem('predictionMarketUser', JSON.stringify({
        username: currentUser.username
      }));
      
      // Update UI
      userInfo.classList.remove('d-none');
      loginBtn.classList.add('d-none');
      usernameDisplay.textContent = currentUser.username;
      balanceDisplay.textContent = currentUser.balance.toFixed(2);
      
      // Show bet form if on market page
      if (betForm && loginAlert) {
        betForm.classList.remove('d-none');
        loginAlert.classList.add('d-none');
      }
      
      // Update user position display
      updateUserPosition();
    }
  });
}

function placeBet() {
  if (!currentUser) {
    alert('Please login to trade');
    return;
  }
  
  const tradeType = tradeTypeSelect.value;
  const outcomeIndex = parseInt(outcomeSelect.value);
  const amount = parseFloat(betAmount.value);
  
  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid amount');
    return;
  }
  
  // For buying, check user balance
  if (tradeType === 'buy' && amount > currentUser.balance) {
    alert('Insufficient balance');
    return;
  }
  
  // For selling, check if user has enough shares to sell
  if (tradeType === 'sell') {
    // Get user's position for this outcome
    const userPosition = getUserPositionForOutcome(outcomeIndex);
    if (userPosition < amount) {
      alert(`You only have ${userPosition.toFixed(2)} shares of ${marketOutcomes[outcomeIndex]} to sell`);
      return;
    }
  }
  
  // Disable button to prevent double-clicks
  placeBetBtn.disabled = true;
  
  // Place trade via Socket.io
  socket.emit('placeBet', {
    marketId,
    outcomeIndex,
    amount: tradeType === 'buy' ? amount : -amount // Negative amount for selling
  }, (response) => {
    placeBetBtn.disabled = false;
    
    if (response.success) {
      // Update user balance
      currentUser.balance = response.newBalance;
      balanceDisplay.textContent = currentUser.balance.toFixed(2);
      
      // Add the new bet to the user's bets array
      if (response.bet) {
        currentUser.bets.push(response.bet);
      }
      
      // Show success message
      const action = tradeType === 'buy' ? 'bought' : 'sold';
      betCostEstimate.innerHTML = `<span class="text-success">Successfully ${action}! ${tradeType === 'buy' ? 'Cost' : 'Received'}: $${Math.abs(response.cost).toFixed(2)}</span>`;
      
      // Reset bet amount
      betAmount.value = '10';
      
      // Update user position display
      updateUserPosition();
    } else {
      // Show error message
      alert('Failed to execute trade: ' + response.error);
    }
  });
}

function updateCostEstimate() {
  if (!outcomeSelect || !betAmount || !tradeTypeSelect) return;
  
  const tradeType = tradeTypeSelect.value;
  const outcomeIndex = parseInt(outcomeSelect.value);
  const amount = parseFloat(betAmount.value);
  
  if (isNaN(amount) || amount <= 0) {
    betCostEstimate.textContent = '';
    return;
  }
  
  // Calculate cost using LMSR
  if (tradeType === 'buy') {
    const cost = calculateCostDifference(quantities, liquidityParameter, outcomeIndex, amount);
    betCostEstimate.textContent = `Estimated cost: $${cost.toFixed(2)}`;
  } else {
    // For selling, calculate how much the user will receive
    const cost = calculateCostDifference(quantities, liquidityParameter, outcomeIndex, -amount);
    betCostEstimate.textContent = `Estimated to receive: $${Math.abs(cost).toFixed(2)}`;
  }
}

// LMSR (Logarithmic Market Scoring Rule) functions
function calculateCost(q, b) {
  // q is an array of quantities for each outcome
  // b is the liquidity parameter
  return b * Math.log(q.reduce((sum, qi) => sum + Math.exp(qi / b), 0));
}

function calculatePrice(q, b, outcomeIndex) {
  // Calculate the current price for a specific outcome
  // Handle the case when all quantities are zero (equal probabilities)
  const allZeros = q.every(qi => qi === 0);
  if (allZeros) {
    return 1 / q.length; // Equal probability for all outcomes
  }
  
  try {
    const expSum = q.reduce((sum, qi) => sum + Math.exp(qi / b), 0);
    return Math.exp(q[outcomeIndex] / b) / expSum;
  } catch (error) {
    console.error('Error in calculatePrice:', error);
    return 1 / q.length; // Fallback to equal probabilities
  }
}

function calculatePrices(q, b) {
  // Calculate prices for all outcomes
  return q.map((_, i) => calculatePrice(q, b, i));
}

function calculateCostDifference(q, b, outcomeIndex, quantity) {
  // Calculate the cost difference when buying 'quantity' of outcome 'outcomeIndex'
  const newQ = [...q];
  newQ[outcomeIndex] += quantity;
  return calculateCost(newQ, b) - calculateCost(q, b);
}

// Helper function to generate colors for the chart
function generateColors(count) {
  const baseColors = [
    '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
    '#1abc9c', '#d35400', '#34495e', '#16a085', '#c0392b'
  ];
  
  // If we have more outcomes than base colors, generate additional colors
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }
  
  const colors = [...baseColors];
  for (let i = baseColors.length; i < count; i++) {
    const hue = (i * 137) % 360; // Use golden ratio to spread colors
    colors.push(`hsl(${hue}, 70%, 60%)`);
  }
  
  return colors;
}

// Update UI with current prices
function updatePricesUI() {
  console.log('Updating UI with prices:', prices);
  
  // Get all probability badges
  const allBadges = document.querySelectorAll('.probability-badge');
  console.log(`Found ${allBadges.length} probability badges, market has ${marketOutcomes.length} outcomes`);
  
  // Only process badges that correspond to actual market outcomes
  allBadges.forEach((badge) => {
    const index = parseInt(badge.getAttribute('data-index'));
    
    // Skip badges that don't have a valid index attribute
    if (isNaN(index)) {
      console.warn('Badge without valid data-index attribute:', badge);
      return;
    }
    
    // Skip badges for outcomes that don't exist in this market
    if (index >= marketOutcomes.length) {
      console.warn(`Badge for non-existent outcome ${index}, market only has ${marketOutcomes.length} outcomes`);
      return;
    }
    
    // Update the badge with the correct probability
    const probability = (prices[index] * 100).toFixed(2);
    badge.textContent = `${probability}%`;
    
    // Find the parent progress bar and update its width
    const progressBar = badge.closest('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${probability}%`;
      progressBar.setAttribute('aria-valuenow', probability);
    }
    
    badge.classList.add('highlight');
    setTimeout(() => badge.classList.remove('highlight'), 1500);
  });
}

// Update price history chart with new data
function updatePriceHistoryChart(history) {
  if (!history || !history.length) return;
  
  // Update each dataset with the price history
  priceHistoryChart.data.datasets.forEach((dataset, index) => {
    // Only process datasets for outcomes that exist in this market
    if (index >= marketOutcomes.length) {
      return;
    }
    
    // Convert price history to chart data format
    dataset.data = history.map(point => {
      // Make sure we have prices for this point
      if (!point.prices || index >= point.prices.length) {
        return {
          x: new Date(point.timestamp),
          y: 0 // Default to 0% if no price data
        };
      }
      
      return {
        x: new Date(point.timestamp),
        y: point.prices[index] * 100 // Convert to percentage
      };
    });
  });
  
  // Update the chart
  priceHistoryChart.update();
}

// Function to update the user's position display
function updateUserPosition() {
  if (!currentUser || !userPositionContainer) return;
  
  // Get user's bets for this market
  const userBetsInMarket = currentUser.bets.filter(bet => bet.marketId === marketId);
  
  if (userBetsInMarket.length === 0) {
    // User has no position in this market
    noPositionAlert.classList.remove('d-none');
    userPositionTable.classList.add('d-none');
    return;
  }
  
  // User has position, hide the alert and show the table
  noPositionAlert.classList.add('d-none');
  userPositionTable.classList.remove('d-none');
  
  // Clear existing position rows
  userPositionTableBody.innerHTML = '';
  
  // Group bets by outcome
  const betsByOutcome = {};
  
  userBetsInMarket.forEach(bet => {
    if (!betsByOutcome[bet.outcomeIndex]) {
      betsByOutcome[bet.outcomeIndex] = {
        totalAmount: 0,
        totalCost: 0,
        bets: []
      };
    }
    
    betsByOutcome[bet.outcomeIndex].totalAmount += bet.amount;
    betsByOutcome[bet.outcomeIndex].totalCost += bet.cost;
    betsByOutcome[bet.outcomeIndex].bets.push(bet);
  });
  
  // Create a row for each outcome the user has bet on
  Object.keys(betsByOutcome).forEach(outcomeIndex => {
    const position = betsByOutcome[outcomeIndex];
    const outcome = marketOutcomes[outcomeIndex];
    const currentPrice = prices[outcomeIndex];
    const probability = (currentPrice * 100).toFixed(2);
    
    // Skip positions with zero or negative shares
    if (position.totalAmount <= 0) return;
    
    const avgCostPerShare = (position.totalCost / position.totalAmount).toFixed(2);
    
    // Calculate unrealized profit/loss
    // Current value = current price * number of shares
    // Cost basis = total cost paid
    // P/L = current value - cost basis
    const currentValue = calculateShareValue(position.totalAmount, outcomeIndex);
    const unrealizedPL = currentValue - position.totalCost;
    const plPercentage = ((unrealizedPL / position.totalCost) * 100).toFixed(2);
    
    // Format P/L with color and percentage
    const plClass = unrealizedPL >= 0 ? 'text-success' : 'text-danger';
    const plSign = unrealizedPL >= 0 ? '+' : '';
    const plFormatted = `<span class="${plClass}">${plSign}$${unrealizedPL.toFixed(2)} (${plSign}${plPercentage}%)</span>`;
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${outcome}</td>
      <td>${probability}%</td>
      <td>${position.totalAmount} shares</td>
      <td>$${position.totalCost.toFixed(2)}</td>
      <td>$${avgCostPerShare}</td>
      <td>${plFormatted}</td>
    `;
    
    userPositionTableBody.appendChild(row);
  });
}

// Calculate the current value of shares for an outcome
function calculateShareValue(shares, outcomeIndex) {
  if (shares <= 0) return 0;
  
  // Create a hypothetical scenario where we sell these shares
  // This gives us the current market value
  const hypotheticalCost = calculateCostDifference(
    quantities, 
    liquidityParameter, 
    outcomeIndex, 
    -shares
  );
  
  // The value is the negative of the cost (since selling gives you money)
  return -hypotheticalCost;
}

// Helper function to get user's position for a specific outcome
function getUserPositionForOutcome(outcomeIndex) {
  if (!currentUser) return 0;
  
  // Get user's bets for this market and outcome
  const userBetsForOutcome = currentUser.bets.filter(
    bet => bet.marketId === marketId && bet.outcomeIndex === outcomeIndex
  );
  
  // Sum up the amounts
  return userBetsForOutcome.reduce((total, bet) => total + bet.amount, 0);
}

// Socket.io event handlers
socket.on('marketUpdate', (data) => {
  if (data.marketId === marketId) {
    // Update quantities and prices
    quantities = data.quantities;
    
    // Calculate or use provided prices
    if (data.prices) {
      prices = data.prices;
    } else {
      prices = calculatePrices(quantities, liquidityParameter);
    }
    
    // Update price history if provided
    if (data.priceHistory) {
      priceHistory = data.priceHistory;
      updatePriceHistoryChart(priceHistory);
    }
    
    // Update UI
    updatePricesUI();
    
    // Update user position display with new prices
    updateUserPosition();
    
    // Update cost estimate if bet form is visible
    if (betForm && !betForm.classList.contains('d-none')) {
      updateCostEstimate();
    }
    
    // Add new bet to the table if provided
    if (data.newBet) {
      addBetToTable(data.newBet);
      
      // Update total bets count if available
      if (data.totalBets !== undefined) {
        updateTotalBetsCount(data.totalBets);
      }
      
      // Show alert if no bets message is displayed
      const noBetsAlert = document.querySelector('#betsContainer .alert-info');
      if (noBetsAlert) {
        // Replace the "no bets" message with a table
        const betsContainer = document.getElementById('betsContainer');
        const isBuy = data.newBet.amount > 0;
        const action = isBuy ? 'Buy' : 'Sell';
        
        betsContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Outcome</th>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>Cost/Proceeds</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr class="highlight">
                  <td>${data.newBet.username}</td>
                  <td>${marketOutcomes[data.newBet.outcomeIndex]}</td>
                  <td>${action}</td>
                  <td>${Math.abs(data.newBet.amount)}</td>
                  <td>$${Math.abs(data.newBet.cost).toFixed(2)}</td>
                  <td>${new Date(data.newBet.timestamp).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }
    }
  }
});

function addBetToTable(bet) {
  // Check if we have a bets table
  const betsTable = document.querySelector('#betsContainer table tbody');
  if (!betsTable) return;
  
  // Create new row
  const row = document.createElement('tr');
  const isBuy = bet.amount > 0;
  const action = isBuy ? 'Buy' : 'Sell';
  
  row.innerHTML = `
    <td>${bet.username}</td>
    <td>${marketOutcomes[bet.outcomeIndex]}</td>
    <td>${action}</td>
    <td>${Math.abs(bet.amount)}</td>
    <td>$${Math.abs(bet.cost).toFixed(2)}</td>
    <td>${new Date(bet.timestamp).toLocaleString()}</td>
  `;
  
  // Add to top of table
  betsTable.insertBefore(row, betsTable.firstChild);
  
  // Highlight the new row
  row.classList.add('highlight');
}

function updateTotalBetsCount(count) {
  // Find the total bets count element
  const totalBetsElements = document.querySelectorAll('.list-group-item');
  for (const element of totalBetsElements) {
    if (element.textContent.includes('Total Bets')) {
      const countSpan = element.querySelector('span:last-child');
      if (countSpan) {
        countSpan.textContent = count;
      }
      break;
    }
  }
}

// Initialize UI with current prices
updatePricesUI();

// Initialize price history chart with initial data
updatePriceHistoryChart(priceHistory);

// Initialize user position if user is logged in
if (currentUser) {
  updateUserPosition();
} 
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
const createMarketBtn = document.getElementById('createMarketBtn');
const addOutcomeBtn = document.getElementById('addOutcomeBtn');
const outcomesContainer = document.getElementById('outcomesContainer');
const marketsContainer = document.getElementById('marketsContainer');

// User data
let currentUser = null;

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

if (createMarketBtn) {
  createMarketBtn.addEventListener('click', createMarket);
}

if (addOutcomeBtn) {
  addOutcomeBtn.addEventListener('click', addOutcomeField);
}

// Add event listeners to remove outcome buttons
document.querySelectorAll('.remove-outcome').forEach(button => {
  button.addEventListener('click', function() {
    if (outcomesContainer.children.length > 2) {
      this.parentElement.remove();
      updateRemoveButtons();
    }
  });
});

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
      const betForm = document.getElementById('betForm');
      const loginAlert = document.getElementById('loginAlert');
      if (betForm && loginAlert) {
        betForm.classList.remove('d-none');
        loginAlert.classList.add('d-none');
      }
    }
  });
}

function createMarket() {
  const title = document.getElementById('marketTitle').value.trim();
  const description = document.getElementById('marketDescription').value.trim();
  const liquidityParameter = document.getElementById('liquidityParameter').value;
  
  // Get outcomes
  const outcomeInputs = document.querySelectorAll('.outcome-input');
  const outcomes = Array.from(outcomeInputs).map(input => input.value.trim()).filter(val => val);
  
  if (!title || !description || outcomes.length < 2 || !liquidityParameter) {
    alert('Please fill in all required fields and provide at least two outcomes.');
    return;
  }
  
  // Create market via API
  fetch('/api/markets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title,
      description,
      outcomes,
      liquidityParameter
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.id) {
      // Success - redirect to the new market
      window.location.href = `/market/${data.id}`;
    } else {
      alert('Failed to create market: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Error creating market:', error);
    alert('Failed to create market. Please try again.');
  });
}

function addOutcomeField() {
  const outcomeCount = outcomesContainer.children.length + 1;
  const outcomeDiv = document.createElement('div');
  outcomeDiv.className = 'input-group mb-2';
  outcomeDiv.innerHTML = `
    <input type="text" class="form-control outcome-input" placeholder="Outcome ${outcomeCount}" required>
    <button type="button" class="btn btn-outline-danger remove-outcome">Remove</button>
  `;
  
  // Add event listener to the remove button
  const removeButton = outcomeDiv.querySelector('.remove-outcome');
  removeButton.addEventListener('click', function() {
    if (outcomesContainer.children.length > 2) {
      this.parentElement.remove();
      updateRemoveButtons();
    }
  });
  
  outcomesContainer.appendChild(outcomeDiv);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const removeButtons = document.querySelectorAll('.remove-outcome');
  if (removeButtons.length <= 2) {
    removeButtons.forEach(button => button.disabled = true);
  } else {
    removeButtons.forEach(button => button.disabled = false);
  }
}

// Socket.io event handlers
socket.on('newMarket', (market) => {
  // Add new market to the list if we're on the homepage
  if (marketsContainer) {
    const marketCard = createMarketCard(market);
    
    // Check if the "no markets" message is displayed
    const noMarketsAlert = marketsContainer.querySelector('.alert-info');
    if (noMarketsAlert) {
      marketsContainer.innerHTML = '';
    }
    
    marketsContainer.prepend(marketCard);
  }
});

// Handle market updates
socket.on('marketUpdate', (data) => {
  // Update market probabilities if we're on the homepage
  if (marketsContainer) {
    const marketId = data.marketId;
    const marketCard = document.querySelector(`.card[data-market-id="${marketId}"]`);
    
    if (marketCard) {
      // Update the probabilities in the market card
      const outcomeItems = marketCard.querySelectorAll('.outcome-item');
      
      if (outcomeItems.length > 0 && data.prices) {
        outcomeItems.forEach((item, index) => {
          if (index < data.prices.length) {
            const probability = (data.prices[index] * 100).toFixed(2);
            const progressBar = item.querySelector('.progress-bar');
            
            if (progressBar) {
              progressBar.style.width = `${probability}%`;
              progressBar.setAttribute('aria-valuenow', probability);
              progressBar.textContent = `${probability}%`;
              
              // Add highlight effect
              progressBar.classList.add('highlight');
              setTimeout(() => progressBar.classList.remove('highlight'), 1500);
            }
          }
        });
      }
    }
  }
});

function createMarketCard(market) {
  const marketDiv = document.createElement('div');
  marketDiv.className = 'col-md-6 col-lg-4 mb-4';
  
  // Calculate prices using LMSR
  const calculatePrice = (q, b, outcomeIndex) => {
    try {
      // Handle the case when all quantities are zero (equal probabilities)
      const allZeros = q.every(qi => qi === 0);
      if (allZeros) {
        return 1 / q.length; // Equal probability for all outcomes
      }
      
      // Handle invalid liquidity parameter
      if (!b || b <= 0) {
        return 1 / q.length; // Fallback to equal probabilities
      }
      
      const expSum = q.reduce((sum, qi) => sum + Math.exp(qi / b), 0);
      const price = Math.exp(q[outcomeIndex] / b) / expSum;
      
      // Validate the calculated price
      if (isNaN(price) || !isFinite(price)) {
        return 1 / q.length; // Fallback to equal probabilities
      }
      
      return price;
    } catch (error) {
      console.error('Error calculating price:', error);
      return 1 / q.length; // Fallback to equal probabilities
    }
  };
  
  const outcomesHtml = market.outcomes.map((outcome, index) => {
    // Ensure market.quantities is an array
    const quantities = Array.isArray(market.quantities) ? market.quantities : Array(market.outcomes.length).fill(0);
    const probability = (calculatePrice(quantities, market.liquidityParameter, index) * 100).toFixed(2);
    
    return `
      <div class="outcome-item">
        <span class="outcome-name">${outcome}</span>
        <div class="progress mb-2">
          <div class="progress-bar" role="progressbar" 
               style="width: ${probability}%" 
               aria-valuenow="${probability}" 
               aria-valuemin="0" aria-valuemax="100">
            ${probability}%
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  marketDiv.innerHTML = `
    <div class="card h-100" data-market-id="${market.id}">
      <div class="card-body">
        <h5 class="card-title">${market.title}</h5>
        <p class="card-text">${market.description}</p>
        <div class="outcomes-list">
          ${outcomesHtml}
        </div>
        <a href="/market/${market.id}" class="btn btn-primary mt-3">View Market</a>
      </div>
      <div class="card-footer text-muted">
        Created: ${new Date(market.created).toLocaleString()}
      </div>
    </div>
  `;
  
  return marketDiv;
} 
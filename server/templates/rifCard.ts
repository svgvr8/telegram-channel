export const getRifCardHTML = (data: {
  price: string;
  marketCap: string;
  change24h: string;
}) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
    }
    
    .card {
      width: 400px;
      height: 200px;
      background: linear-gradient(135deg, #1a1b23 0%, #24252f 100%);
      border-radius: 16px;
      padding: 20px;
      color: white;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .logo {
      width: 48px;
      height: 48px;
      background: #2f3037;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .logo svg {
      width: 32px;
      height: 32px;
      fill: #00ff00;
    }
    
    .token-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .token-name {
      font-size: 24px;
      font-weight: 600;
    }
    
    .token-symbol {
      font-size: 16px;
      color: #7289da;
      margin-left: 8px;
    }
    
    .chain-badge {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .stats {
      margin-top: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    
    .stat-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 12px;
      border-radius: 8px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #8a8b94;
      margin-bottom: 4px;
    }
    
    .stat-value {
      font-size: 16px;
      font-weight: 500;
    }
    
    .change-positive {
      color: #00ff00;
    }
    
    .change-negative {
      color: #ff0000;
    }
    
    .creator-info {
      position: absolute;
      bottom: 12px;
      left: 20px;
      font-size: 11px;
      color: #8a8b94;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <div class="logo">
        <svg viewBox="0 0 24 24">
          <!-- Simplified molecule icon -->
          <path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10-4.48 10-10S17.52,2 12,2zm0,18c-4.41,0-8-3.59-8-8s3.59-8 8-8 8,3.59 8,8-3.59,8-8,8z"/>
        </svg>
      </div>
      <div class="token-info">
        <div>
          <span class="token-name">Rifampicin</span>
          <span class="token-symbol">$RIF</span>
        </div>
        <div class="chain-badge">
          <span>🌐 Worms</span>
        </div>
      </div>
    </div>
    
    <div class="stats">
      <div class="stat-item">
        <div class="stat-label">Life Extension</div>
        <div class="stat-value ${parseFloat(data.change24h) >= 0 ? 'change-positive' : 'change-negative'}">
          ${data.change24h}%
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Market Cap</div>
        <div class="stat-value">${data.marketCap}</div>
      </div>
    </div>
    
    <div class="creator-info">
      Created by JBxY...c1xQ
    </div>
  </div>
</body>
</html>
`; 
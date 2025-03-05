interface Template {
  name: string;
  html: string;
  css: string;
}

export const defaultTemplates: Template[] = [
  {
    name: "Simple Announcement",
    html: `
      <div class="container">
        <div class="announcement">
          <h1>📢 Announcement</h1>
          <p class="message">Your message here</p>
        </div>
      </div>
    `,
    css: `
      .container {
        width: 800px;
        height: 400px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #6366f1 0%, #2563eb 100%);
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .announcement {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 16px;
        padding: 2rem 3rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        text-align: center;
        max-width: 80%;
      }
      
      h1 {
        color: #1e293b;
        font-size: 2.5rem;
        font-weight: 700;
        margin: 0 0 1rem 0;
      }
      
      .message {
        color: #475569;
        font-size: 1.5rem;
        line-height: 1.6;
        margin: 0;
      }
    `
  },
  {
    name: "Quote Card",
    html: `
      <div class="container">
        <div class="quote-card">
          <svg class="quote-icon" viewBox="0 0 24 24">
            <path fill="currentColor" d="M9.583 17.321C8.553 16.227 8 15.1 8 13.026c0-3.715 2.905-6.663 6.505-6.663v2.494c-2.12.038-4.05 1.508-4.05 3.61 0 .394.038.737.114 1.063h1.517c2.048 0 3.708 1.653 3.708 3.696 0 2.042-1.66 3.696-3.708 3.696s-3.708-1.654-3.708-3.696l.205-.905zm8.333 0c-.97-1.094-1.524-2.221-1.524-4.295 0-3.715 2.906-6.663 6.506-6.663v2.494c-2.12.038-4.05 1.508-4.05 3.61 0 .394.038.737.114 1.063h1.517c2.047 0 3.708 1.653 3.708 3.696 0 2.042-1.661 3.696-3.708 3.696s-3.708-1.654-3.708-3.696l.205-.905z"/>
          </svg>
          <p class="quote">Your inspirational quote here</p>
          <p class="author">- Author Name</p>
        </div>
      </div>
    `,
    css: `
      .container {
        width: 800px;
        height: 400px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .quote-card {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 16px;
        padding: 3rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        text-align: center;
        max-width: 80%;
        position: relative;
      }
      
      .quote-icon {
        width: 48px;
        height: 48px;
        color: #6366f1;
        margin-bottom: 1rem;
      }
      
      .quote {
        color: #1e293b;
        font-size: 1.75rem;
        line-height: 1.5;
        font-weight: 500;
        margin: 0 0 1.5rem 0;
      }
      
      .author {
        color: #64748b;
        font-size: 1.25rem;
        font-style: italic;
        margin: 0;
      }
    `
  },
  {
    name: "Event Card",
    html: `
      <div class="container">
        <div class="event-card">
          <div class="date">
            <span class="day">15</span>
            <span class="month">MAR</span>
          </div>
          <div class="content">
            <h2 class="title">Event Title</h2>
            <p class="details">🕒 Time • 📍 Location</p>
            <p class="description">Short description of the event goes here</p>
          </div>
        </div>
      </div>
    `,
    css: `
      .container {
        width: 800px;
        height: 400px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #818cf8 0%, #4f46e5 100%);
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .event-card {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        display: flex;
        gap: 2rem;
        align-items: center;
        max-width: 80%;
      }
      
      .date {
        background: #4f46e5;
        color: white;
        padding: 1rem;
        border-radius: 12px;
        text-align: center;
        min-width: 100px;
      }
      
      .day {
        display: block;
        font-size: 2.5rem;
        font-weight: 700;
        line-height: 1;
        margin-bottom: 0.25rem;
      }
      
      .month {
        display: block;
        font-size: 1.25rem;
        font-weight: 500;
      }
      
      .content {
        flex: 1;
      }
      
      .title {
        color: #1e293b;
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
      }
      
      .details {
        color: #6366f1;
        font-size: 1.125rem;
        margin: 0 0 1rem 0;
      }
      
      .description {
        color: #475569;
        font-size: 1.125rem;
        line-height: 1.5;
        margin: 0;
      }
    `
  }
];

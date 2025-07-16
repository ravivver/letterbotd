# 🎬 Letterboxd Discord Bot

A full-featured Discord bot developed in Node.js that integrates Letterboxd functionalities directly into your servers!

This bot allows users to link their Letterboxd profiles and share their activity, stats, reviews, favorite films, and even compare their taste with other server members.

## ⚠️ Technical Considerations

This project uses **web scraping** to collect data from the Letterboxd platform. This technical choice is due to the fact that Letterboxd **does not provide an easily accessible public API**. To use the official API, you must submit a formal application and be approved, which can be a lengthy and challenging process for study projects and small-scale development.

Using web scraping offers the flexibility to extract necessary information directly from visible HTML pages, allowing the desired features to be implemented, although it may require maintenance if the structure of the Letterboxd site changes.

## ✨ Main Features

- **Comprehensive Search:** Search for movies and directors with the `/search` command.
- **Profile Interaction:** View stats, favorites, diary entries, and reviews with the `/profile`, `/favorites`, `/diary`, and `/review` commands.
- **Activity Analysis:** Check if someone has already watched a movie using `/checkfilm`.
- **Social Features:** Compare films in common between two users with `/compare` and get random watchlist suggestions with `/hint`.
- **Server Ranking:** Discover the most popular films on the server using `/top`!
- **Image Generation:** Create custom poster grids using the `/favorites` and `/likesgrid` commands.

## 🚀 Technologies Used

- **Node.js**
- **discord.js v14+** (Slash Commands, Buttons, Select Menus, Embeds)
- **axios** & **cheerio** for web scraping Letterboxd data
- **TMDB API** for data enrichment (posters, synopses, directors)
- **sharp** for image processing
- **sqlite3** for persistent data storage (server ranking)

## 🤖 Available Commands

Here is the full list of commands:

### 🧩 Essential Commands (must be configured first)

- **`/link [username]`**: 🔗 Links your Discord account to a Letterboxd profile.
- **`/unlink`**: 🔓 Unlinks your account.
- **`/setchannel`**: 📢 Sets the channel for daily watched film notifications.
- **`/sync`**: 🔄 Syncs your Letterboxd diary to feed the server ranking.
- **`/help`**: ❓ Displays this list of commands.

---

### 🎬 User & Movie Commands

- **`/search film: [term]`**: 🔍 Searches for a movie or director.
- **`/check user: [user] film: [film]`**: ✔️ Checks if a user has watched a specific film.
- **`/profile [user]`**: 🧾 Displays general statistics of a Letterboxd profile.
- **`/favorites [user]`**: 💖 Shows the 4 favorite movies of a user in a list and grid.
- **`/diary [user] [day] [month] [year]`**: 🗓️ Shows the films watched on a specific date.
- **`/review [user] [film]`**: 📝 Displays the latest or a specific review.
- **`/grid [user]`**: 🖼️ Generates a movie poster grid (liked or watched).
- **`/last`**: 🎞️ Shows the latest movie watched by a user on Letterboxd.

---

### 🔍 Discovery & Comparison

- **`/compare user1: [@user] [user2: @user]`**: 📊 Compares and lists common films between two users, with pagination.
- **`/hint [user]`**: 🎲 Suggests a random movie from a user’s watchlist.
- **`/top`**: 🏆 Shows the top 5 most watched movies among users who used `/sync`.
- **`/topbot`**: 🥇 Displays the top 5 most watched films across all servers.

---

### 🧠 Interactive & Social Features

- **`/quiz`**: 🎯 A quick game where the bot shows a synopsis, a poster, or a quote, and users must guess the correct movie.
- **`/taste`**: 💞 Analyzes taste compatibility between two users (from 0 to 100%).
- **`/familymatch`**: 👪 One user starts, others join (up to 5 total), and the bot finds a movie suitable for all to watch together.
- **`/impostor`**: 🕵️ The bot shows 4 films a user apparently loved, but one is rated 1 star or less — others must guess which one is the fake.

---

### 🎶 Other Tools

- **`/soundtrack`**: 🎼 Returns the film's soundtrack or composer.
- **`/similar`**: 🧠 Recommends similar films based on one given.
- **`/trip`**: 🌍 Suggests a film with filters (year, genre, or country).
- **`/letterid`**: 🪪 Generates a “cinephile ID card” for the user.



## 🔧 Setup and Installation

Follow the steps below to run your own instance of the bot.

1. **Clone the Repository:**
    ```bash
    git clone https://github.com/ravivver/letterbotd.git
    cd letterbotd
    ```

2. **Install Dependencies:**
    ```bash
    npm install
    ```

3. **Configure `.env`:**
    - Create a `.env` file in the root directory.
    - Add the following variables with your keys:
        ```env
        DISCORD_TOKEN=YOUR_TOKEN_HERE
        TMDB_API_KEY=YOUR_KEY_HERE
        ```

4. **Set Up the Database (First Time):**
    ```bash
    node database/setup.js
    ```

5. **Register the Commands:**
    ```bash
    node deploy-commands.js
    ```

6. **Start the Bot:**
    ```bash
    node index.js
    ```

## 🤝 Contributing

Contributions are welcome! Feel free to open *issues* to report bugs or suggest improvements, or send *pull requests* with new features.

*This project uses web scraping as its main data source from Letterboxd due to the lack of an easily accessible public API.*

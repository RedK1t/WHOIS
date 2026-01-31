# Use the official Node.js image
FROM node:22-bookworm-slim

# Create and define the application directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install ONLY production dependencies
RUN npm install

# Copy the rest of your application code
# (This includes server.js and any other files)
COPY . .

# Document the port the app runs on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
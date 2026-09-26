FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

# Let Cloud Run set the port, default to 8080
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

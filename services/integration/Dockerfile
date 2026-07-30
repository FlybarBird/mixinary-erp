
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY sql ./sql
COPY src ./src
ENV PORT=8091
EXPOSE 8091
CMD ["npm", "start"]


FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=8092
EXPOSE 8092
CMD ["npm", "start"]

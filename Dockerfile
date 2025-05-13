FROM apify/actor-node-playwright-chrome
COPY . ./
CMD ["npm", "start"]

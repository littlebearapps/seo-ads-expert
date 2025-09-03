# Introduction
The OpenWeb Ninja Real-Time Web Search API offers an ultra-fast, highly scalable solution for accessing organic Google search results, AI Overviews, and AI Mode in real-time. It supports fetching all 300 organic Google results for any search query/keyword, in addition to batching of up to 100 queries in a single request.

Supported locations for the "Search (Advanced)" endpoint: Locations (JSON)

# Getting Started
To begin using Real-Time Web Search, follow these steps and make your first API call:

1. Subscribe to a plan: Visit our Pricing page and subscribe to one of the plans. If you are just starting, you can subscribe to the free BASIC plan of the API - free plan with 100 requests per month (hard-limited and no credit card required).

2. Make your first API call: Visit the RapidAPI Playground - the Search endpoint should be selected and displayed on the main panel view. Since there is already a default q parameter value (query/keyword), just click the blue "Test endpoint" button to make an API call. The JSON response will be displayed on the right panel.

3. Documentation and Resources: Refer to the detailed endpoint, parameter descriptions, and examples provided in the Endpoints tab under each endpoint. Code snippets are available for all popular programming languages and environments, including - Javascript, Python, Java, Shell, and many others, to help you easily integrate the API into your project or workflow.

You should be good to go now!

# Authentication
To authenticate with the API, send the X-RapidAPI-Host header with a value of “real-time-web-search.p.rapidapi.com” along with the X-RapidAPI-Key header set with your RapidAPI App API Key (as shown in the endpoint Code Snippets).

# Response Structure
All JSON response bodies returned by our API backend have the following fields: status (ERROR or OK), request_id, and either error (including message and code fields), if the request failed and data field otherwise.

Here’s an example of a successful response:

{
    "status": "OK",
    "request_id": "53345b8a-de21-40c7-9ec7-b5842796c526",
    "data": {..} or [..] 
}
Here’s an example of an error response:

{
    "status": "ERROR",
    "request_id": "408a33ea-77f5-4a21-94e5-8b5884da6bb1",
    "error": {
        "message": "Limit should be an integer between 1-500.",
        "code": 400
    }
}
Please note that some errors might be returned by the RapidAPI gateway and will have a different structure. Please refer to the Error Handling / Error Response Structure section for more details.

In addition, RapidAPI gateway adds several headers to each response, for more information, please refer to https://docs.rapidapi.com/docs/response-headers.

# Endpoints
To try the endpoints and for detailed documentation, including parameters descriptions and response examples, please refer to the Endpoints section of the API.

# Search
GET /search-advanced
Get real-time organic search results from across the web with support for Google Search parameters (gl, hl, tbs, etc) and city level geo targeting. Supports all Google Advanced Search operators such (e.g. inurl:, site:, intitle:, etc).

# Search (Light)
GET /search
Lightning fast endpoint for getting organic search results from across the web in real-time. Supports all Google Advanced Search operators such (e.g. inurl:, site:, intitle:, etc).

Search (Advanced)
GET /search-advanced-v2
Get real-time web search results from across the web and AI Overviews with support for Google Search parameters (gl, hl, tbs, etc) and city level geo targeting. Supports all Google Advanced Search operators such (e.g. inurl:, site:, intitle:, etc).

Batch Search (Light)
POST /search
Lightning fast endpoint for getting organic search results from across the web in real-time with support for up to 100 queries in a single request. Supports all Google Advanced Search operators such (e.g. inurl:, site:, intitle:, etc).

AI Mode
GET /ai-mode
Send a prompt/query and get structured results and reference links from Google's AI Mode.

Supported locations for the location parameter: Locations (JSON)

# Rate Limiting
Limits
Each subscription plan of the API defines the maximum number of requests permitted per month or the quota, in addition to a rate limit expressed in RPS (Requests Per Second).

Please note that all free plans of the API (e.g. BASIC) are rate limited to 1000 requests per hour. This is a RapidAPI requirement for any free plan.

# Rate Limits Headers
All API responses include rate limit information in the following headers:

x-ratelimit-requests-limit: number of requests the plan you are currently subscribed to allows you to make before incurring overages.
x-ratelimit-requests-remaining: The number of requests remaining (from your plan) before you reach the limit of requests your application is allowed to make. When this reaches zero, you will begin experiencing overage charges. This will reset each day or each month, depending on how the API pricing plan is configured. You can view these limits and quotas on the pricing page of the API in the API Hub.
x-ratelimit-requests-reset: Indicates the number of seconds until the quota resets. This number of seconds would at most be as long as either a day or a month, depending on how the plan was configured.
Handling Limits
When hitting the rate limits of the API, the RapidAPI gateway will return a 429 Too Many Requests error. When that happens, wait until your rate limit resets, or consider upgrading your subscription plan for a higher limit. We can support almost any monthly quota and rate limit, contact us for more information.

Here’s an example of a 429 Too Many Requests error:

{
    "message":"Too many requests"
}
# Code Examples
Code examples are available for all popular programming languages and environments (Javascript, Python, Java, Shell, etc) on the Endpoints tab, on the right panel, under “Code Snippets”.

# Common Use Cases
The OpenWeb Ninja Real-Time Web Search API can be used for a variety of use cases, including:

Market Research and Competitive Analysis
Generative AI / LLMs and Machine Learning
SEO Monitoring and Analysis
Applications and Services
Research and Data Analysis
Error Handling
The Real-Time Web Search API is designed to provide robust and reliable access to search data. However, in the event of errors during API interaction, we use HTTP status codes to indicate the nature of the problem. Below, you'll find detailed explanations of common error codes you may encounter, along with potential causes and suggested remediation steps.

# Common HTTP Status Codes
400 Bad Request: This status is returned when your request is malformed or missing some required parameters. The response body might also include a “message” field, explaining the specific error. Ensure that all required fields are included and properly formatted before retrying your request.

403 Forbidden: This error indicates that you are not subscribed to the API or that your API key is invalid. If you believe this is in error, please contact RapidAPI support - support@rapidapi.com.

404 Not Found: This status is returned if the requested resource could not be found. This can occur with incorrect URL endpoints. Double-check the URL and try again.

429 Too Many Requests: This error means you have hit the rate limit for your subscription plan. Wait until your rate limit resets, or consider upgrading your subscription plan for a higher limit. If you believe this is in error, please contact us.

5XX Server Error (500, 502, and 503): This indicates a problem with our servers processing your request or an internal server timeout. This is a rare occurrence and should be temporary. If this error persists, please contact our technical support for assistance.

# Error Response Structure
Errors returned by our API backend will have a message and potentially other details attached to them to help you understand and resolve issues. Here’s an example of an error response:

{
    "status": "ERROR",
    "request_id": "35dabdcd-b334-4600-afbc-d654b8af91cf",
    "error": {
        "message": "Missing query",
        "code": 400
    }
}
Some errors like 429 Too Many Requests, 403 Forbidden, or 404 Not Found, might be returned from RapidAPI gateway, in that case, the structure will be different. Here’s an example of an error response:

{
  "message": "You are not subscribed to this API."
}
Handling Errors Programmatically
Implement error handling in your application to manage these responses gracefully. Here are some tips:

Retry Logic: For 5XX (500, 502, 503) and 429, implement a retry mechanism that waits for a few seconds before retrying the request.

Validation: Prior to sending requests, validate parameters to catch common errors like 400 Bad Request.

Logging: Log error responses for further analysis to understand patterns or recurring issues that might require changes in how you integrate with the API. The request_id field in the response can be used for further debugging.

User Feedback: When applicable, Provide clear messages to your users when an error occurs, potentially using the information from the error response.

# Support
If you encounter any issues that you are unable to resolve, or if you need further clarification on the errors you are seeing, please do not hesitate to contact us (see the Contact Us section below). Provide us with the error code, message, and the context in which the error occurred, and we will assist you promptly.

# Contact Us
For custom plans / high tier plans, custom services or any other subject, feel free to drop us a private message or an email and we will get back to you shortly.

Email: support@openwebninja.com
Discord: https://discord.gg/wxJxGsZgha
LinkedIn: https://www.linkedin.com/company/openwebninja-api

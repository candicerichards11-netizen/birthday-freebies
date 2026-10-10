# Birthday Freebies Tracker: Netlify setup

The public page remains static, while Netlify Functions and Netlify Blobs provide shared owner-managed content.

## Before using the Owner Panel

1. Set a strong `OWNER_PASSWORD` environment variable for the Netlify site. Use at least 16 characters; a randomly generated passphrase is better. Set it in Netlify under **Site configuration → Environment variables** and make it available to Functions and the deploy context you use.
2. Deploy the branch or merge it to the production branch. Netlify should install `@netlify/blobs` from `package.json` and bundle the function in `netlify/functions`.
3. Open the public site and use **Owner Panel** in the bottom bar. Sign in with the password you set in Netlify.
4. Add your public phone, WhatsApp number, email, optional business/page name, general service area, social links, and—if approved—AdSense publisher and ad-slot IDs.

The owner password is read only by the server function; it is not included in the page source. The function signs an eight-hour, HTTP-only, secure session cookie using that password. Do not commit the password or send it in chat.

## Income features

- The ad banner stays hidden until a valid AdSense publisher ID and slot ID are saved.
- Freebie records can include an optional partner/affiliate URL. Only add links for real programs you are accepted into, and clearly disclose paid or affiliate links.
- Ad approval, traffic, clicks, and revenue are not guaranteed. Keep offer terms current and verify them with the business.
- Visitor update suggestions open WhatsApp or email. The site does not store visitor messages.

## Birthday planner

The printable planner at `/birthday-planner.html` saves form entries in that visitor's browser. Visitors can choose **Print / Save as PDF** in their browser to create a PDF copy.

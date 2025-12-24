# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]: Welcome back
    - generic [ref=e6]: Sign in to your Scholaracle account
  - generic [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e9]:
        - text: Email
        - textbox "Email" [ref=e10]:
          - /placeholder: name@example.com
      - generic [ref=e11]:
        - text: Password
        - textbox "Password" [ref=e12]
    - generic [ref=e13]:
      - button "Sign in" [ref=e14]
      - generic [ref=e15]:
        - text: Don't have an account?
        - link "Sign up" [ref=e16] [cursor=pointer]:
          - /url: /register
```
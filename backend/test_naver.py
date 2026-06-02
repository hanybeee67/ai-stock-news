import requests
import urllib.parse
name = "동진쎄미켐"
url = f"https://ac.finance.naver.com/ac?q={urllib.parse.quote(name)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8"
res = requests.get(url)
print(res.json())

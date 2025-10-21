def create_username(first_name,last_name):
    username = first_name[0]+last_name
    username = username.lower()
    return username
username_1 = create_username("Huy","Hoang")
print(username_1)
import random
def create_password():
    password = str(random.randint(1000, 9999))
    return password
create_password()
def create_database(customers):
    db={}
    for khach in customers:
        username = create_username(khach[0],khach[1])
        password = create_password()
        db[username]=password
    n_customers = len(db)
    return db,n_customers
customers = [["Huy","Hoang"],["Anh","Khoa"],["Trung","Nguyen"],["Ngoc","Khanh"]]
database,number_customers=create_database(customers)
print(database)
print("so luong khach hang: ",number_customers)
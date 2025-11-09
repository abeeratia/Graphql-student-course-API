import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Course from "./models/courses.js";
import Student from "./models/student.js";

dotenv.config();

//& ========== In-Memory Users ==========
let users = [];

//& ========== JWT Helper ==========
const createToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.SECRET_KEY, {
    expiresIn: "7d",
  });

const getUserFromToken = (authHeader) => {
  try {
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    return jwt.verify(token, process.env.SECRET_KEY);
  } catch {
    return null;
  }
};

//& ========== GraphQL Schema ==========
const typeDefs = gql`
  type User {
    id: ID!
    email: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Student {
    id: ID!
    name: String!
    email: String!
    age: Int!
    major: String!
    courses: [Course]
    coursesCount: Int!
  }

  type Course {
    id: ID!
    title: String!
    code: String!
    credits: Int!
    instructor: String!
    students: [Student]
    studentsCount: Int!
  }

  input StudentInput {
    name: String
    email: String
    age: Int
    major: String
  }

  input StudentUpdateInput {
    name: String
    email: String
    age: Int
    major: String
  }

  input CourseInput {
    title: String!
    code: String!
    credits: Int!
    instructor: String!
  }

  input CourseUpdateInput {
    title: String
    code: String
    credits: Int
    instructor: String
  }

  input ListOptions {
    limit: Int
    offset: Int
    sortBy: String
    sortOrder: String
  }

  input StudentFilter {
    major: String
    nameContains: String
    emailContains: String
    minAge: Int
    maxAge: Int
  }

  input CourseFilter {
    codePrefix: String
    titleContains: String
    instructor: String
    minCredits: Int
    maxCredits: Int
  }

  type Query {
    getAllStudents(filter: StudentFilter, options: ListOptions): [Student!]!
    getAllCourses(filter: CourseFilter, options: ListOptions): [Course!]!
  }

  type Mutation {
    # Auth
    signup(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!

    # Students
    addStudent(input: StudentInput!): Student!
    updateStudent(id: ID!, input: StudentUpdateInput!): Student!
    deleteStudent(id: ID!): Boolean!

    # Courses
    addCourse(input: CourseInput!): Course!
    updateCourse(id: ID!, input: CourseUpdateInput!): Course!
    deleteCourse(id: ID!): Boolean!

    # Enrollments
    enrollStudent(studentId: ID!, courseId: ID!): Student!
    unenrollStudent(studentId: ID!, courseId: ID!): Student!
  }
`;

//& ========== Resolvers ==========
const resolvers = {
  Query: {
    getAllStudents: async (_, { filter, options }) => {
      let query = {};

      if (filter?.major) query.major = filter.major;
      if (filter?.nameContains)
        query.name = { $regex: filter.nameContains, $options: "i" };
      if (filter?.emailContains)
        query.email = { $regex: filter.emailContains, $options: "i" };

      if (filter?.minAge || filter?.maxAge) {
        query.age = {};
        if (filter.minAge) query.age.$gte = filter.minAge;
        if (filter.maxAge) query.age.$lte = filter.maxAge;
      }

      let students = Student.find(query);

      //& Sorting
      if (options?.sortBy) {
        const order = options.sortOrder === "DESC" ? -1 : 1;
        students = students.sort({ [options.sortBy]: order });
      }

      const limit = Math.min(options?.limit || 10, 50);
      const offset = options?.offset || 0;
      students = students.skip(offset).limit(limit);

      return await students.populate("courses");
    },

    getAllCourses: async (_, { filter, options }) => {
      let query = {};

      if (filter?.titleContains)
        query.title = { $regex: filter.titleContains, $options: "i" };
      if (filter?.codePrefix)
        query.code = { $regex: `^${filter.codePrefix}`, $options: "i" };
      if (filter?.instructor) query.instructor = filter.instructor;

      if (filter?.minCredits || filter?.maxCredits) {
        query.credits = {};
        if (filter.minCredits) query.credits.$gte = filter.minCredits;
        if (filter.maxCredits) query.credits.$lte = filter.maxCredits;
      }

      let courses = Course.find(query);

      //& Sorting
      if (options?.sortBy) {
        const order = options.sortOrder === "DESC" ? -1 : 1;
        courses = courses.sort({ [options.sortBy]: order });
      }

      const limit = Math.min(options?.limit || 10, 50);
      const offset = options?.offset || 0;
      courses = courses.skip(offset).limit(limit);

      return await courses.populate("students");
    },
  },

  Mutation: {
    //& ====== Auth ======
    signup: async (_, { email, password }) => {
      const existing = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      );
      if (existing) throw new Error("Email already exists");
      if (!email.includes("@")) throw new Error("Invalid email");
      if (password.length < 6) throw new Error("Password too short");

      const hashed = await bcrypt.hash(password, 10);
      const newUser = { id: Date.now().toString(), email, password: hashed };
      users.push(newUser);

      const token = createToken(newUser);
      return { token, user: newUser };
    },

    login: async (_, { email, password }) => {
      const user = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      );
      if (!user) throw new Error("User not found");
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error("Invalid password");

      const token = createToken(user);
      return { token, user };
    },

    //& ====== Students ======
    addStudent: async (_, { input }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      if (!input.email.includes("@")) throw new Error("Invalid email");
      if (input.age < 16) throw new Error("Student must be >= 16");

      const exists = await Student.findOne({
        email: { $regex: new RegExp(`^${input.email}$`, "i") },
      });
      if (exists) throw new Error("Email already exists");

      const newStudent = new Student(input);
      await newStudent.save();
      return newStudent;
    },

    updateStudent: async (_, { id, input }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      if (input.email && !input.email.includes("@"))
        throw new Error("Invalid email");

      const updated = await Student.findByIdAndUpdate(id, input, { new: true });
      if (!updated) throw new Error("Student not found");
      return updated;
    },

    deleteStudent: async (_, { id }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      const student = await Student.findById(id);
      if (!student) return false;

      //& remove enrollments
      await Course.updateMany({}, { $pull: { students: id } });
      await student.deleteOne();
      return true;
    },

    //& ====== Courses ======
    addCourse: async (_, { input }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      if (input.credits < 1 || input.credits > 6)
        throw new Error("Credits must be between 1 and 6");

      const exists = await Course.findOne({
        code: { $regex: new RegExp(`^${input.code}$`, "i") },
      });
      if (exists) throw new Error("Course code already exists");

      const newCourse = new Course(input);
      await newCourse.save();
      return newCourse;
    },

    updateCourse: async (_, { id, input }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      const updated = await Course.findByIdAndUpdate(id, input, { new: true });
      if (!updated) throw new Error("Course not found");
      return updated;
    },

    deleteCourse: async (_, { id }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      const course = await Course.findById(id);
      if (!course) return false;

      await Student.updateMany({}, { $pull: { courses: id } });
      await course.deleteOne();
      return true;
    },

    //& ====== Enrollment ======
    enrollStudent: async (_, { studentId, courseId }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      const student = await Student.findById(studentId);
      const course = await Course.findById(courseId);
      if (!student || !course) throw new Error("Invalid IDs");

      if (!student.courses.includes(courseId)) student.courses.push(courseId);
      if (!course.students.includes(studentId)) course.students.push(studentId);

      await student.save();
      await course.save();

      return student.populate("courses");
    },

    unenrollStudent: async (_, { studentId, courseId }, { user }) => {
      if (!user) throw new Error("UNAUTHENTICATED");

      const student = await Student.findById(studentId);
      const course = await Course.findById(courseId);
      if (!student || !course) throw new Error("Invalid IDs");

      student.courses.pull(courseId);
      course.students.pull(studentId);

      await student.save();
      await course.save();

      return student.populate("courses");
    },
  },

  Student: {
    courses: async (parent) => Course.find({ _id: { $in: parent.courses } }),
    coursesCount: (parent) => parent.courses?.length || 0,
  },
  Course: {
    students: async (parent) => Student.find({ _id: { $in: parent.students } }),
    studentsCount: (parent) => parent.students?.length || 0,
  },
};

//& ========== Server Setup ==========
const startServer = async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/graphql-lab-day2");
  console.log("✅ MongoDB Connected");

  const app = express();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      const token = req.headers.authorization || "";
      const user = getUserFromToken(token);
      return { user };
    },
  });

  await server.start();
  server.applyMiddleware({ app, path: "/graphql" });

  app.listen(4000, () =>
    console.log("🚀 Server ready at http://localhost:4000/graphql")
  );
};

startServer();
